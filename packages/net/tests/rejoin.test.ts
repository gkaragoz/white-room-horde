import { GAME_VERSION, Buttons, type PlayerInput } from '@wrh/shared';
import { scriptedInput } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Bin, NetSession, RoomManager, decodeBundle, type Conn } from '../src';

/** A zero-latency link between a NetSession and the manager, on a clock the test controls. */
class Pair {
  readonly conn: Conn;
  readonly session: NetSession;
  private n = 0;
  constructor(
    private readonly mgr: RoomManager,
    clock: { now: number },
  ) {
    this.conn = { send: (d) => this.session.onMessage(d) };
    this.session = new NetSession({ send: (d) => mgr.handle(this.conn, d) }, () => clock.now);
  }
  /** One frame of a page: an input every 33 ms and the playout of whatever arrived. */
  frame(now: number): void {
    if (now % 33 === 0 && this.session.state === 'playing') this.session.sendInput(scriptedInput(this.n++, this.session.slot));
    this.session.pump();
  }
}

class World2 {
  readonly clock = { now: 1000 };
  readonly mgr: RoomManager;
  readonly pairs: Pair[] = [];
  constructor(opts: { catchUpLimit?: number } = {}) {
    this.mgr = new RoomManager({ rate: 1e9, ...opts });
    const host = new Pair(this.mgr, this.clock);
    this.pairs.push(host);
    host.session.create('host');
    const guest = new Pair(this.mgr, this.clock);
    this.pairs.push(guest);
    guest.session.join(host.session.code, 'guest');
    host.session.start();
  }
  run(ms: number, each?: () => void): void {
    for (let i = 0; i < ms; i++) {
      this.clock.now++;
      if (this.clock.now % 33 === 0) this.mgr.tick();
      for (const p of this.pairs) p.frame(this.clock.now);
      each?.();
    }
  }
}

/** A hand-made connection that records what the relay sends it. */
function raw(): { conn: Conn; got: (string | Uint8Array)[]; json: () => { t: string; code?: string }[]; ticks: () => number[] } {
  const got: (string | Uint8Array)[] = [];
  return {
    conn: { send: (d) => got.push(d) },
    got,
    json: () => got.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as { t: string; code?: string }),
    ticks: () => got.filter((d): d is Uint8Array => typeof d !== 'string' && d[0] === Bin.Bundle).map((d) => decodeBundle(d, 11).tick),
  };
}

describe('pause, resume and the silence watchdog', () => {
  it('the first frames after a long pause never look like a dead connection', () => {
    const w = new World2();
    w.run(3000);
    const host = w.pairs[0]!.session;
    const guest = w.pairs[1]!.session;
    expect(host.state).toBe('playing');
    host.setPause(true);
    w.run(65_000); // a minute with no ticks at all
    expect(guest.paused).toBe(true);
    host.setPause(false);
    // the page's watchdog (main.ts): playing, not paused, silent for more than 4 s and not just resumed
    let worst = 0;
    w.run(4000, () => {
      for (const s of [host, guest]) {
        const fires = s.state === 'playing' && !s.paused && s.sinceBundleMs > 4000 && s.sinceResumeMs > 3000;
        expect(fires).toBe(false);
        if (!s.paused) worst = Math.max(worst, s.sinceBundleMs);
      }
    });
    // and the silence clock really restarted instead of carrying the minute over
    expect(worst).toBeLessThan(1000);
    expect(guest.world!.tick).toBeGreaterThan(80);
  });
});

describe('rejoining a running game', () => {
  it('sends the room (slot and token) before the world, so the page knows its slot as soon as it has one', () => {
    const w = new World2();
    w.run(1500);
    const g = w.pairs[1]!.session;
    const code = g.code;
    const token = g.token;
    w.mgr.close(w.pairs[1]!.conn);
    const r = raw();
    w.mgr.handle(r.conn, JSON.stringify({ t: 'rejoin', code, token, v: GAME_VERSION }));
    const kinds = r.json().map((m) => m.t);
    expect(kinds[0]).toBe('room');
    expect(kinds[1]).toBe('start');
  });

  it('a page that kept its world is sent only the ticks it missed and no new start', () => {
    const w = new World2();
    w.run(2500);
    const g = w.pairs[1]!;
    const have = g.session.applied;
    expect(have).toBeGreaterThan(40);
    const code = g.session.code;
    const token = g.session.token;
    w.mgr.close(g.conn);
    w.run(1000); // the game goes on without it
    const r = raw();
    w.mgr.handle(r.conn, JSON.stringify({ t: 'rejoin', code, token, v: GAME_VERSION, have }));
    for (let i = 0; i < 10; i++) w.mgr.tick();
    const kinds = r.json().map((m) => m.t);
    expect(kinds[0]).toBe('room');
    expect(kinds).not.toContain('start');
    const ticks = r.ticks();
    expect(ticks[0]).toBe(have + 1);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBe(ticks[i - 1]! + 1);
    expect(ticks.length).toBeGreaterThan(20);
  });

  it('a session adopted from a dropped one keeps its world and slot and stays on the same hash', () => {
    const w = new World2();
    w.run(2500);
    const old = w.pairs[1]!;
    const world = old.session.world!;
    const slot = old.session.slot;
    const token = old.session.token;
    const code = old.session.code;
    const have = old.session.applied;
    w.mgr.close(old.conn);
    w.run(800);
    const fresh = new Pair(w.mgr, w.clock);
    fresh.session.adopt(old.session);
    expect(fresh.session.world).toBe(world);
    expect(fresh.session.slot).toBe(slot); // known from the first frame: nothing to race against
    w.pairs[1] = fresh;
    fresh.session.rejoin(code, token, have);
    w.run(1500);
    expect(fresh.session.world).toBe(world);
    expect(fresh.session.adopted).toBe(true);
    expect(Math.abs(fresh.session.world!.tick - w.pairs[0]!.session.world!.tick)).toBeLessThan(8);
    expect(fresh.session.desyncTicks.length).toBe(0);
    expect(w.pairs[0]!.session.desyncTicks.length).toBe(0);
  });

  it('an unknown `have` falls back to a fresh start; a long history is sent a few hundred bundles per tick, in order', () => {
    const w = new World2({ catchUpLimit: 1e9 });
    for (let i = 0; i < 3000; i++) w.mgr.tick(); // 3000 ticks of history with nobody pumping
    const g = w.pairs[1]!;
    const code = g.session.code;
    const token = g.session.token;
    w.mgr.close(g.conn);
    const r = raw();
    w.mgr.handle(r.conn, JSON.stringify({ t: 'rejoin', code, token, v: GAME_VERSION, have: 999_999 }));
    expect(r.json().map((m) => m.t).slice(0, 2)).toEqual(['room', 'start']);
    expect(r.ticks().length).toBe(0); // nothing in the same breath
    w.mgr.tick();
    const first = r.ticks().length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(301);
    for (let i = 0; i < 20; i++) w.mgr.tick();
    const ticks = r.ticks();
    expect(ticks.length).toBeGreaterThan(3000);
    for (let i = 0; i < ticks.length; i++) expect(ticks[i]).toBe(i);
  });

  it('a snapshot donor that never answers is given up on and the asker gets the history', () => {
    const mgr = new RoomManager({ rate: 1e9, catchUpLimit: 20 });
    const host = raw();
    mgr.handle(host.conn, JSON.stringify({ t: 'create', name: 'h', v: GAME_VERSION }));
    const code = host.json().find((m) => m.t === 'room')!.code!;
    const guest = raw();
    mgr.handle(guest.conn, JSON.stringify({ t: 'join', code, name: 'g', v: GAME_VERSION }));
    mgr.handle(host.conn, JSON.stringify({ t: 'start' }));
    for (let i = 0; i < 200; i++) mgr.tick();
    const token = (guest.json().filter((m) => m.t === 'room').pop() as unknown as { token: string }).token;
    mgr.close(guest.conn);
    const back = raw();
    mgr.handle(back.conn, JSON.stringify({ t: 'rejoin', code, token, v: GAME_VERSION }));
    // the host was asked for a snapshot and stays silent
    expect(host.json().some((m) => m.t === 'snapshotRequest')).toBe(true);
    for (let i = 0; i < 100; i++) mgr.tick();
    expect(back.ticks().every((t) => t >= 200)).toBe(true); // only the live ticks so far: the history waits for the donor
    for (let i = 0; i < 100; i++) mgr.tick();
    // the donor stayed silent for 5 s: the whole history follows (the page stores bundles by tick, so live ones ahead of it are fine)
    const have = new Set(back.ticks());
    for (let t = 0; t < 300; t++) expect(have.has(t)).toBe(true);
  });

  it('says why a rejoin failed: room gone, seat given up, wrong version', () => {
    const w = new World2();
    w.run(500);
    const r1 = raw();
    w.mgr.handle(r1.conn, JSON.stringify({ t: 'rejoin', code: 'ZZZZ', token: 'x', v: GAME_VERSION }));
    expect(JSON.parse(r1.got[0] as string)).toMatchObject({ t: 'error', code: 'room_gone' });
    const r2 = raw();
    w.mgr.handle(r2.conn, JSON.stringify({ t: 'rejoin', code: w.pairs[0]!.session.code, token: 'nope', v: GAME_VERSION }));
    expect(JSON.parse(r2.got[0] as string)).toMatchObject({ t: 'error', code: 'bad_token' });
    const r3 = raw();
    w.mgr.handle(r3.conn, JSON.stringify({ t: 'rejoin', code: w.pairs[0]!.session.code, token: 'nope', v: '0.1.0' }));
    expect(JSON.parse(r3.got[0] as string)).toMatchObject({ t: 'error', code: 'version' });
  });
});

describe('away players', () => {
  it('a client cannot claim to be away: the relay strips the flag from what it sends', () => {
    const w = new World2();
    w.run(300);
    const room = [...w.mgr.rooms.values()][0]!;
    const forged: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Away | Buttons.Fire };
    room.input(1, room.tick + 2, forged);
    expect(room.members[1]!.pending.get(room.tick + 2)!.buttons & Buttons.Away).toBe(0);
  });

  it('a silent connected player gets the Away flag from the relay after 12 missed ticks, a returning input clears it', () => {
    const mgr = new RoomManager({ rate: 1e9 });
    const host = raw();
    mgr.handle(host.conn, JSON.stringify({ t: 'create', name: 'h', v: GAME_VERSION }));
    mgr.handle(host.conn, JSON.stringify({ t: 'start' }));
    const room = [...mgr.rooms.values()][0]!;
    for (let i = 0; i < 40; i++) mgr.tick();
    const last = decodeBundle(host.got.filter((d): d is Uint8Array => typeof d !== 'string' && d[0] === Bin.Bundle).pop()!, 11);
    expect((last.inputs[0]!.buttons & Buttons.Away) !== 0).toBe(true);
    room.input(0, room.tick + 1, { moveX: 1, moveY: 0, aim: 0, buttons: 0 });
    mgr.tick();
    mgr.tick();
    const next = decodeBundle(host.got.filter((d): d is Uint8Array => typeof d !== 'string' && d[0] === Bin.Bundle).pop()!, 11);
    expect(next.inputs[0]!.buttons & Buttons.Away).toBe(0);
  });
});

describe('input tags across a pause', () => {
  function pauseCase(pauseMs: number): void {
    const w = new World2();
    w.run(3000);
    const host = w.pairs[0]!.session;
    const guest = w.pairs[1]!.session;
    const room = [...w.mgr.rooms.values()][0]!;
    host.setPause(true);
    w.run(pauseMs, () => expect(room.members[1]!.pending.size).toBeLessThan(80)); // nothing piles up on the relay while it stands still
    host.setPause(false);
    w.run(2500);
    for (const s of [host, guest]) expect(s.sentTick - room.tick).toBeLessThanOrEqual(s.lead + 3); // the tags are where the relay can use them
    // real inputs are applied again: the relay does not have to invent "away" inputs
    expect(room.members[1]!.miss ?? 0).toBeLessThan(3);
    expect(guest.world!.pAway[1]).toBe(0);
    expect(host.world!.pAway[0]).toBe(0);
  }

  it('after a pause of 5 s everybody can still act', () => pauseCase(5000));
  it('after a pause of 15 s everybody can still act (this used to lock every input out for good)', () => pauseCase(15_000));
  it('after a pause of a minute everybody can still act', () => pauseCase(60_000));

  it('a page sends no inputs while the game is paused', () => {
    const w = new World2();
    w.run(2000);
    let n = 0;
    const orig = w.mgr.handle.bind(w.mgr);
    w.mgr.handle = (c, d) => {
      if (typeof d !== 'string' && d[0] === Bin.Inputs) n++;
      orig(c, d);
    };
    w.pairs[0]!.session.setPause(true);
    w.run(3000);
    expect(n).toBe(0);
    w.pairs[0]!.session.setPause(false);
    w.run(500);
    expect(n).toBeGreaterThan(10);
  });

  it('a tag that ran far ahead of the relay is pulled back by itself', () => {
    const w = new World2();
    w.run(2000);
    const guest = w.pairs[1]!.session;
    (guest as unknown as { maxSent: number }).maxSent = guest.applied + 500;
    const base = Math.max(guest.received, guest.applied) + guest.lead;
    expect(guest.inputTick()).toBeLessThanOrEqual(base + 1);
  });
});
