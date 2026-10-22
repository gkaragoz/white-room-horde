import { BALANCE, Buttons, FloorPhase, MISC, type PlayerInput } from '@wrh/shared';
import { hashWorld, predictPlayer, scriptedInput } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Bin, NetSession, RoomManager, type Conn, type ManagerOptions } from '../src';

/** Virtual-time network: every message is delayed by latency + jitter; per-link ordering is preserved (TCP-like). */
class Net {
  now = 0;
  readonly manager: RoomManager;

  constructor(opts: ManagerOptions = {}) {
    this.manager = new RoomManager({ rate: 1e9, ...opts });
  }
  readonly clients: Client[] = [];
  private queue: { at: number; run: () => void; seq: number }[] = [];
  private seq = 0;
  private rng = 12345;
  private nextTick = 0;

  rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  schedule(delay: number, run: () => void): void {
    this.queue.push({ at: this.now + delay, run, seq: this.seq++ });
  }

  addClient(latency: number, jitter: number): Client {
    const c = new Client(this, latency, jitter);
    this.clients.push(c);
    return c;
  }

  advance(ms: number): void {
    const end = this.now + ms;
    while (this.now < end) {
      this.now += 1;
      while (this.nextTick <= this.now) {
        this.manager.tick();
        this.nextTick += 1000 / 30;
      }
      for (;;) {
        const due = this.queue.filter((q) => q.at <= this.now).sort((a, b) => a.at - b.at || a.seq - b.seq);
        if (!due.length) break;
        this.queue = this.queue.filter((q) => q.at > this.now);
        for (const d of due) d.run();
      }
      for (const c of this.clients) c.frame();
    }
  }
}

class Client {
  readonly session: NetSession;
  /** The server's handle for this client. */
  readonly serverConn: Conn;
  private upLast = 0;
  private downLast = 0;
  private acc = 0;
  private localTick = 0;
  /** Smooth playout instead of stepping as soon as bundles arrive; records when each tick was simulated. */
  useDrive = false;
  /** A frozen page: nothing is sent and nothing is simulated while true. */
  muted = false;
  readonly stepTimes: number[] = [];
  /** Where the inputs come from (default: the scripted walk). */
  inputFn: ((n: number, slot: number) => PlayerInput) | null = null;
  /** Share of the input messages the link loses (a lossy path; the real WebSocket delays instead, but a proxy or a mobile hand-over can drop). */
  lossUp = 0;
  /** Drops every n-th input message (never two in a row for n >= 2). */
  dropEvery = 0;
  private upCount = 0;

  constructor(
    private readonly net: Net,
    private readonly latency: number,
    private readonly jitter: number,
  ) {
    this.serverConn = { send: (d) => this.link('down', d) };
    this.session = new NetSession({ send: (d) => this.link('up', d) }, () => net.now);
  }

  private link(dir: 'up' | 'down', d: string | Uint8Array): void {
    if (dir === 'up' && this.dropEvery > 0 && typeof d !== 'string' && d[0] === Bin.Inputs && ++this.upCount % this.dropEvery === 0) return;
    if (dir === 'up' && this.lossUp > 0 && typeof d !== 'string' && d[0] === Bin.Inputs && this.net.rand() < this.lossUp) return;
    const last = dir === 'up' ? this.upLast : this.downLast;
    const at = Math.max(this.net.now + this.latency + this.net.rand() * this.jitter, last);
    if (dir === 'up') this.upLast = at;
    else this.downLast = at;
    this.net.schedule(at - this.net.now, () => (dir === 'up' ? this.net.manager.handle(this.serverConn, d) : this.session.onMessage(d)));
  }

  frame(): void {
    if (this.muted) return;
    this.acc += 1;
    if (this.acc >= 1000 / 30) {
      this.acc -= 1000 / 30;
      if (this.session.state === 'playing') {
        const inp: PlayerInput = (this.inputFn ?? scriptedInput)(this.localTick++, this.session.slot);
        this.session.sendInput(inp);
      }
    }
    if (this.useDrive) {
      const n = this.session.drive(1 / 1000);
      for (let i = 0; i < n; i++) this.stepTimes.push(this.net.now);
    } else this.session.pump();
  }
}

function lobby(latencies: number[], jitter = 20, opts: ManagerOptions = {}): Net {
  const net = new Net(opts);
  const cs = latencies.map((l) => net.addClient(l, jitter));
  cs[0]!.session.create('host');
  net.advance(300);
  for (let i = 1; i < cs.length; i++) cs[i]!.session.join(cs[0]!.session.code, 'p' + i);
  net.advance(400);
  return net;
}

describe('lockstep over a laggy network', () => {
  it('a client that freezes for 600 ms never holds the others back and catches up without a desync', () => {
    const net = lobby([40, 40, 40], 15);
    net.clients[1]!.useDrive = true;
    net.clients[0]!.session.start();
    net.advance(3000);
    const before = net.clients[0]!.session.world!.tick;
    net.clients[1]!.muted = true;
    net.advance(600);
    const during = net.clients[0]!.session.world!.tick;
    // the others kept simulating at full speed while the page was frozen
    expect(during - before).toBeGreaterThan(14);
    expect(net.clients[2]!.session.world!.tick - before).toBeGreaterThan(14);
    net.clients[1]!.muted = false;
    net.advance(4000);
    const w0 = net.clients[0]!.session.world!;
    const w1 = net.clients[1]!.session.world!;
    expect(Math.abs(w0.tick - w1.tick)).toBeLessThan(15);
    expect(net.clients.every((c) => c.session.desyncTicks.length === 0)).toBe(true);
    expect(net.clients[1]!.session.resyncs).toBe(0);
    expect(net.clients[1]!.session.backlog).toBeLessThan(10);
  });

  it('the snapshot donor is the healthiest connection and not the host when someone else will do', () => {
    const net = lobby([40, 40, 40, 40], 5);
    net.clients[0]!.session.start();
    net.advance(1500);
    const room = [...net.manager.rooms.values()][0]!;
    const m = room.members;
    m[0]!.rtt = 20; // the host: fastest, but it carries the most already
    m[1]!.rtt = 300;
    m[2]!.rtt = 60;
    m[3]!.rtt = 90;
    expect(room.pickDonor(1)!.slot).toBe(2);
    expect(room.pickDonor(2)!.slot).toBe(3);
    // with the host as the only healthy member left it is the donor after all
    for (const s of [1, 2, 3]) room.diverged.add(s);
    expect(room.pickDonor(1)!.slot).toBe(0);
    room.diverged.clear();
    // nobody else at all: no donor
    expect(room.pickDonor(0)!.slot).not.toBe(0);
  });

  it('smooth playout steps on an even clock even when bundles arrive in bursts', () => {
    const net = lobby([50, 50], 70);
    const c = net.clients[1]!;
    c.useDrive = true;
    net.clients[0]!.session.start();
    net.advance(1500);
    c.stepTimes.length = 0;
    net.advance(6000);
    const gaps: number[] = [];
    for (let i = 1; i < c.stepTimes.length; i++) gaps.push(c.stepTimes[i]! - c.stepTimes[i - 1]!);
    gaps.sort((a, b) => a - b);
    expect(c.stepTimes.length).toBeGreaterThan(150);
    const p90 = gaps[Math.floor(gaps.length * 0.9)]!;
    expect(p90).toBeLessThanOrEqual(60); // bursts would show as 0 ms gaps followed by long ones
    expect(c.session.jitterMs).toBeGreaterThan(5);
    expect(c.session.playoutTicks).toBeGreaterThanOrEqual(2);
  });

  it('stays in step with a pump-driven client on the same checkpoints', () => {
    const net = lobby([40, 90], 40);
    net.clients[1]!.useDrive = true;
    net.clients[0]!.session.start();
    net.advance(5000);
    const a = net.clients[0]!.session.world!;
    const b = net.clients[1]!.session.world!;
    expect(net.clients[1]!.session.desyncTicks.length).toBe(0);
    const common = Math.min(a.tick, b.tick);
    expect(common).toBeGreaterThan(60);
    expect(net.clients[1]!.session.resyncs).toBe(0);
  });

  it('builds a room with a code and starts for everyone', () => {
    const net = lobby([40, 40, 40, 40, 40]);
    const host = net.clients[0]!.session;
    expect(host.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(host.players.length).toBe(5);
    expect(host.players[0]!.host).toBe(true);
    host.start();
    net.advance(1500);
    for (const c of net.clients) expect(c.session.state).toBe('playing');
  });

  it('lets players pick their starting weapon in the lobby and starts with it', () => {
    const net = lobby([30, 30]);
    net.clients[1]!.session.setWeapon('shotgun');
    net.advance(300);
    expect(net.clients[0]!.session.players.find((p) => p.slot === 1)!.weapon).toBe('shotgun');
    net.clients[0]!.session.start();
    net.advance(800);
    const w = net.clients[0]!.session.world!;
    expect(w.pWeapon[1]).toBe(3); // shotgun index
    expect(w.pWeapon[0]).toBe(0);
  });

  it('keeps clients with different latency on identical hashes at every checkpoint', () => {
    const net = lobby([20, 60, 120, 40]);
    net.clients[0]!.session.start();
    const seen = net.clients.map(() => new Map<number, number>());
    for (let t = 0; t < 30000; t++) {
      net.advance(1);
      net.clients.forEach((c, i) => {
        const w = c.session.world;
        if (w && w.tick % 30 === 0 && !seen[i]!.has(w.tick)) seen[i]!.set(w.tick, hashWorld(w));
      });
    }
    let compared = 0;
    for (const [tick, h] of seen[0]!) {
      for (let i = 1; i < net.clients.length; i++) {
        const o = seen[i]!.get(tick);
        if (o === undefined) continue;
        expect(o).toBe(h);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(80);
    expect(net.clients.every((c) => c.session.desyncTicks.length === 0)).toBe(true);
  });

  it('climbs from floor to floor with every client on the same hash, and a late joiner mid-flight lands in the same place', () => {
    // tiny floors so the scripted players clear them quickly
    const keep = [BALANCE.waves.baseCount, BALANCE.waves.perPlayer, BALANCE.waves.waveSizeMul, BALANCE.player.hp, BALANCE.waves.spawnSeconds];
    BALANCE.waves.spawnSeconds = 4; // the enemies of a tiny floor arrive at once (the real floors take 20 s)
    BALANCE.player.hp = 1e6; // nobody dies while the scripted players clear the floors
    BALANCE.waves.baseCount = 2;
    BALANCE.waves.perPlayer = 0;
    BALANCE.waves.waveSizeMul = 1;
    try {
      const net = lobby([30, 80, 50], 20);
      net.clients[0]!.session.start();
      const seen = net.clients.map(() => new Map<number, number>());
      let late: Client | null = null;
      let sawFlight = false;
      for (let t = 0; t < 240000; t++) {
        net.advance(1);
        net.clients.forEach((c, i) => {
          const w = c.session.world;
          if (!w) return;
          const mine = seen[i];
          if (mine && w.tick % 30 === 0 && !mine.has(w.tick)) mine.set(w.tick, hashWorld(w));
        });
        const w0 = net.clients[0]!.session.world;
        if (w0 && w0.misc[MISC.Phase] === FloorPhase.Ascend) sawFlight = true;
        if (!late && w0 && w0.misc[MISC.Phase] === FloorPhase.Ascend && w0.wave === 1) {
          late = net.addClient(40, 10);
          late.session.join(net.clients[0]!.session.code, 'late');
        }
        if (w0 && w0.wave >= 3 && late && late.session.world && late.session.world.wave >= 3) break;
      }
      expect(sawFlight).toBe(true);
      expect(net.clients[0]!.session.world!.wave).toBeGreaterThanOrEqual(3);
      expect(net.clients.every((c) => c.session.desyncTicks.length === 0)).toBe(true);
      let compared = 0;
      for (const [tick, h] of seen[0]!) {
        for (let i = 1; i < net.clients.length; i++) {
          const o = seen[i]?.get(tick);
          if (o === undefined) continue;
          expect(o).toBe(h);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(30); // how fast the scripted players clear a floor differs a little per machine
      expect(late).not.toBeNull();
      expect(Math.abs(late!.session.world!.tick - net.clients[0]!.session.world!.tick)).toBeLessThan(20);
      expect(late!.session.world!.wave).toBe(net.clients[0]!.session.world!.wave);
      expect(late!.session.world!.map).toBe(net.clients[0]!.session.world!.map);
    } finally {
      [BALANCE.waves.baseCount, BALANCE.waves.perPlayer, BALANCE.waves.waveSizeMul, BALANCE.player.hp, BALANCE.waves.spawnSeconds] = keep as [number, number, number, number, number];
    }
  }, 240000);

  it('a late joiner fast-forwards and converges; a perturbed client is reported as desynced', () => {
    const net = lobby([30, 30, 30], 10);
    net.clients[0]!.session.start();
    net.advance(8000);
    const late = net.addClient(30, 10);
    late.session.join(net.clients[0]!.session.code, 'late');
    net.advance(4000);
    expect(late.session.state).toBe('playing');
    const a = net.clients[0]!.session.world!;
    const b = late.session.world!;
    expect(Math.abs(a.tick - b.tick)).toBeLessThan(12);
    expect(b.pActive[3]).toBe(1);
    expect(a.pActive[3]).toBe(1);
    net.clients[1]!.session.world!.pX[0] = 999;
    net.advance(2500);
    expect(net.clients.some((c) => c.session.desyncTicks.length > 0)).toBe(true);
    // the diverged client asked for a snapshot and rolled forward: it matches the others again
    net.advance(4000);
    expect(net.clients[1]!.session.resyncs).toBeGreaterThan(0);
    const t = Math.min(...net.clients.map((c) => c.session.world!.tick));
    expect(Math.abs(net.clients[1]!.session.world!.pX[0]! - net.clients[0]!.session.world!.pX[0]!)).toBeLessThan(40);
    expect(net.clients[1]!.session.world!.pX[0]).not.toBe(999);
    expect(t).toBeGreaterThan(300);
  });

  it('survives a client dropping out mid game', () => {
    const net = lobby([30, 30, 30], 10);
    net.clients[0]!.session.start();
    net.advance(3000);
    net.manager.close(net.clients[2]!.serverConn);
    net.advance(3000);
    expect(net.clients[0]!.session.world!.tick).toBeGreaterThan(150);
    expect(Math.abs(net.clients[0]!.session.world!.tick - net.clients[1]!.session.world!.tick)).toBeLessThan(10);
  });
});

describe('robustness of the room server', () => {
  it('keeps the old options when the host sends ones this build does not know', () => {
    const net = lobby([20, 20]);
    net.clients[0]!.session.setOptions(2, 2);
    net.advance(300);
    net.clients[0]!.session.setOptions(99, 3);
    net.advance(300);
    expect(net.clients[1]!.session.options).toEqual({ map: 2, mods: 3 });
    net.clients[0]!.session.setOptions(1, -4);
    net.advance(300);
    expect(net.clients[1]!.session.options).toEqual({ map: 1, mods: 3 });
  });

  it('options (map, mods) reach every client and the world', () => {
    const net = lobby([20, 20]);
    net.clients[0]!.session.setOptions(2, 2);
    net.advance(300);
    expect(net.clients[1]!.session.options).toEqual({ map: 2, mods: 2 });
    // non-hosts cannot change them
    net.clients[1]!.session.setOptions(1, 0);
    net.advance(300);
    expect(net.clients[0]!.session.options).toEqual({ map: 2, mods: 2 });
    net.clients[0]!.session.start();
    net.advance(800);
    expect(net.clients[1]!.session.world!.map).toBe(2);
    expect(net.clients[1]!.session.world!.mods).toBe(2);
  });

  it('a dropped player rejoins the same slot with their token and catches up', () => {
    const net = lobby([30, 30, 30], 10);
    net.clients[0]!.session.start();
    net.advance(4000);
    const victim = net.clients[2]!;
    const { token, slot } = victim.session;
    expect(token.length).toBeGreaterThan(10);
    net.manager.close(victim.serverConn); // connection lost, not a deliberate leave
    net.advance(2000);
    const back = net.addClient(30, 10);
    back.session.rejoin(net.clients[0]!.session.code, token);
    net.advance(3000);
    expect(back.session.state).toBe('playing');
    expect(back.session.slot).toBe(slot);
    expect(Math.abs(back.session.world!.tick - net.clients[0]!.session.world!.tick)).toBeLessThan(12);
    expect(back.session.world!.pActive[slot]).toBe(1);
    // a wrong token is refused
    const bad = net.addClient(30, 10);
    bad.session.rejoin(net.clients[0]!.session.code, 'NOPE');
    net.advance(500);
    expect(bad.session.error).toContain('cannot rejoin');
    expect(bad.session.errorCode).toBe('bad_token');
  });

  it('the host who dropped gets the host role back on rejoining', () => {
    const net = lobby([30, 30, 30], 10);
    net.clients[0]!.session.start();
    net.advance(3000);
    const host = net.clients[0]!;
    const { token } = host.session;
    net.manager.close(host.serverConn);
    net.advance(1000);
    expect(net.clients[1]!.session.players.find((p) => p.host)?.slot).not.toBe(0); // somebody else carries the role meanwhile
    const back = net.addClient(30, 10);
    back.session.rejoin(net.clients[1]!.session.code, token);
    net.advance(2000);
    expect(back.session.players.filter((p) => p.host).map((p) => p.slot)).toEqual([0]);
    expect(net.clients[1]!.session.players.filter((p) => p.host).map((p) => p.slot)).toEqual([0]);
  });

  it('the pending inputs predict the local character: where the replay says it will be is where the simulation puts it', () => {
    const net = lobby([70, 70], 10);
    const me = net.clients[1]!;
    me.useDrive = true;
    net.clients[0]!.useDrive = true;
    net.clients[0]!.session.start();
    net.advance(1500);
    const asked = new Map<number, { x: number; y: number; lead: number }>();
    let checked = 0;
    let exact = 0;
    let maxLead = 0;
    for (let ms = 0; ms < 6000; ms++) {
      net.advance(1);
      const w = me.session.world;
      if (!w || me.session.catchingUp) continue;
      const slot = me.session.slot;
      const done = asked.get(w.tick);
      if (done && w.pState[slot] === 0) {
        checked++;
        if (Math.abs(done.x - w.pX[slot]!) < 1e-9 && Math.abs(done.y - w.pY[slot]!) < 1e-9) exact++;
        asked.delete(w.tick);
      }
      const list = me.session.pendingInputs();
      if (list.length) {
        const p = predictPlayer(w, slot, list);
        const at = w.tick + list.length;
        asked.set(at, { x: p.x, y: p.y, lead: list.length });
        maxLead = Math.max(maxLead, list.length);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(maxLead).toBeGreaterThanOrEqual(3); // there is a delay to hide
    expect(exact).toBe(checked);
  });


  /** A hammerer who holds the fire button (the charge slows the walk) and walks: the prediction has to know the slowdown. */
  function hammerPredictionRun(lossUp: number, jitter: number, latency: number, dropEvery = 0): { checked: number; exact: number; worst: number } {
    const net = new Net();
    const host = net.addClient(30, 5);
    const me = net.addClient(latency, jitter);
    host.session.create('host');
    net.advance(300);
    me.session.join(host.session.code, 'me', 'hammer');
    net.advance(400);
    me.session.setLook(0, -1, 8);
    net.advance(100);
    me.useDrive = true;
    host.useDrive = true;
    me.lossUp = lossUp;
    me.dropEvery = dropEvery;
    me.inputFn = (n) => {
      // walk in a slow circle, hold fire for 25 ticks of every 60, tap dash now and then
      const a = n * 0.05;
      const hold = n % 60 < 25;
      return { moveX: Math.round(Math.cos(a) * 127), moveY: Math.round(Math.sin(a) * 127), aim: (n * 3) & 255, buttons: (hold ? Buttons.Fire : 0) | (n % 97 === 0 ? Buttons.Dash : 0) };
    };
    host.session.start();
    net.advance(1500);
    const asked = new Map<number, { x: number; y: number }>();
    let checked = 0;
    let exact = 0;
    let worst = 0;
    for (let ms = 0; ms < 6000; ms++) {
      net.advance(1);
      const w = me.session.world;
      if (!w || me.session.catchingUp) continue;
      const slot = me.session.slot;
      const done = asked.get(w.tick);
      if (done && w.pState[slot] === 0) {
        checked++;
        const err = Math.hypot(done.x - w.pX[slot]!, done.y - w.pY[slot]!);
        worst = Math.max(worst, err);
        if (err < 1e-9) exact++;
        asked.delete(w.tick);
      }
      const list = me.session.pendingInputs();
      if (list.length) {
        const p = predictPlayer(w, slot, list);
        asked.set(w.tick + list.length, { x: p.x, y: p.y });
      }
    }
    return { checked, exact, worst };
  }

  it('a hammerer who charges while walking is predicted exactly', () => {
    const r = hammerPredictionRun(0, 10, 70);
    expect(r.checked).toBeGreaterThan(100);
    expect(r.exact).toBe(r.checked);
  });

  it('a lossy link: the inputs repeated in later messages keep the prediction exact', () => {
    const r = hammerPredictionRun(0.1, 10, 70);
    expect(r.checked).toBeGreaterThan(100);
    expect(r.exact / r.checked).toBeGreaterThan(0.9);
    expect(r.worst).toBeLessThan(2);
    // every third message lost (never two in a row): the repeats in the next message always make it good
    const steady = hammerPredictionRun(0, 10, 70, 3);
    expect(steady.checked).toBeGreaterThan(100);
    expect(steady.exact).toBe(steady.checked);
  });

  it('a late joiner into a long game gets a snapshot instead of the whole history, and converges', () => {
    const net = lobby([20, 20, 20], 5, { catchUpLimit: 60 });
    net.clients[0]!.session.start();
    net.advance(6000); // 180 ticks, above the limit
    const late = net.addClient(20, 5);
    late.session.join(net.clients[0]!.session.code, 'late');
    net.advance(3000);
    expect(late.session.resyncs).toBeGreaterThan(0); // a snapshot was applied
    expect(late.session.state).toBe('playing');
    const a = net.clients[0]!.session.world!;
    const b = late.session.world!;
    expect(Math.abs(a.tick - b.tick)).toBeLessThan(12);
    expect(b.pActive[3]).toBe(1);
    expect(net.clients.every((c) => c.session.desyncTicks.length === 0)).toBe(true);
  });

  it('rooms can be locked with a password', () => {
    const net = new Net();
    const [host, guest, guest2] = [net.addClient(10, 0), net.addClient(10, 0), net.addClient(10, 0)];
    host.session.create('host', 'pistol', { password: 'sesame' });
    net.advance(200);
    expect(host.session.locked).toBe(true);
    guest.session.join(host.session.code, 'g', 'pistol', { password: 'wrong' });
    guest2.session.join(host.session.code, 'g2', 'pistol', { password: 'sesame' });
    net.advance(300);
    expect(guest.session.error).toBe('wrong password');
    expect(guest2.session.state).toBe('lobby');
    expect(host.session.players.length).toBe(2);
  });

  it('ignores malformed messages and rate-limits floods without crashing', async () => {
    const net = lobby([10, 10], 0, { rate: 100 });
    const conn = net.clients[0]!.serverConn;
    for (const junk of ['{', 'null', '[]', '{"t":5}', '{"t":"join","code":{}}', '{"t":"hash","tick":"x","hash":1}', 'x'.repeat(2000), '{"t":"options","map":99,"mods":-4}']) net.manager.handle(conn, junk);
    net.manager.handle(conn, new Uint8Array([1, 2, 3]));
    net.manager.handle(conn, new Uint8Array(10).fill(255));
    expect(net.clients[0]!.session.options.map).toBeLessThan(4);
    // a flood of pings is mostly dropped (the bucket empties) instead of being answered one by one
    let replies = 0;
    const counting: Conn = { send: () => replies++ };
    for (let i = 0; i < 5000; i++) net.manager.handle(counting, JSON.stringify({ t: 'ping', ts: 0 }));
    expect(replies).toBeLessThanOrEqual(210); // only the burst allowance (2x the rate) is answered
    const flood = net.clients[0]!.serverConn;
    let answered = 0;
    const probe: Conn = { send: () => answered++ };
    net.manager.handle(probe, JSON.stringify({ t: 'create', name: 'x' }));
    for (let i = 0; i < 3000; i++) net.manager.handle(probe, JSON.stringify({ t: 'ping', ts: 1 }));
    expect(answered).toBeLessThan(400);
    expect(flood).toBeDefined();
    // the allowance refills with real time, then the room works again
    await new Promise((r) => setTimeout(r, 400));
    net.clients[0]!.session.start();
    net.advance(1500);
    expect(net.clients[1]!.session.state).toBe('playing');
  });
});
