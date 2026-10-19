import { type PlayerInput } from '@wrh/shared';
import { hashWorld, scriptedInput } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { NetSession, RoomManager, type Conn, type ManagerOptions } from '../src';

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

  constructor(
    private readonly net: Net,
    private readonly latency: number,
    private readonly jitter: number,
  ) {
    this.serverConn = { send: (d) => this.link('down', d) };
    this.session = new NetSession({ send: (d) => this.link('up', d) }, () => net.now);
  }

  private link(dir: 'up' | 'down', d: string | Uint8Array): void {
    const last = dir === 'up' ? this.upLast : this.downLast;
    const at = Math.max(this.net.now + this.latency + this.net.rand() * this.jitter, last);
    if (dir === 'up') this.upLast = at;
    else this.downLast = at;
    this.net.schedule(at - this.net.now, () => (dir === 'up' ? this.net.manager.handle(this.serverConn, d) : this.session.onMessage(d)));
  }

  frame(): void {
    this.acc += 1;
    if (this.acc >= 1000 / 30) {
      this.acc -= 1000 / 30;
      if (this.session.state === 'playing') {
        const inp: PlayerInput = scriptedInput(this.localTick++, this.session.slot);
        this.session.sendInput(inp);
      }
    }
    this.session.pump();
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
  it('options (map, difficulty) reach every client and the world', () => {
    const net = lobby([20, 20]);
    net.clients[0]!.session.setOptions(2, 2);
    net.advance(300);
    expect(net.clients[1]!.session.options).toEqual({ map: 2, difficulty: 2 });
    // non-hosts cannot change them
    net.clients[1]!.session.setOptions(1, 0);
    net.advance(300);
    expect(net.clients[0]!.session.options).toEqual({ map: 2, difficulty: 2 });
    net.clients[0]!.session.start();
    net.advance(800);
    expect(net.clients[1]!.session.world!.map).toBe(2);
    expect(net.clients[1]!.session.world!.difficulty).toBe(2);
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
    expect(bad.session.error).toBe('cannot rejoin');
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
    for (const junk of ['{', 'null', '[]', '{"t":5}', '{"t":"join","code":{}}', '{"t":"hash","tick":"x","hash":1}', 'x'.repeat(2000), '{"t":"options","map":99,"difficulty":-4}']) net.manager.handle(conn, junk);
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
