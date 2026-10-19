import { GAME_VERSION } from '@wrh/shared';
import { hashWorld, scriptedInput } from '@wrh/sim';
import { NetSession } from '@wrh/net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../src/server';

/** A headless game client: a real WebSocket, a NetSession with the real simulation, and a 30 Hz input loop. */
class Bot {
  ws: WebSocket;
  session: NetSession;
  hashes = new Map<number, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;

  constructor(url: string, readonly name: string) {
    this.ws = new WebSocket(url);
    this.session = new NetSession({ send: (d) => this.ws.readyState === WebSocket.OPEN && this.ws.send(d) });
    this.ws.on('message', (data, isBinary) => this.session.onMessage(isBinary ? new Uint8Array(data as Buffer) : data.toString()));
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  run(): void {
    this.timer = setInterval(() => {
      const s = this.session;
      if (s.state === 'playing' && s.world) {
        s.sendInput(scriptedInput(this.n++, s.slot));
        s.pump(6, {
          after: (w) => {
            if (w.tick % 30 === 0) this.hashes.set(w.tick, hashWorld(w));
          },
        });
      }
    }, 1000 / 30);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close(): void {
    this.stop();
    this.ws.terminate();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms: number, what: string): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what);
    await sleep(25);
  }
}

describe('real server, real sockets, real simulation', () => {
  let srv: RunningServer;
  let url: string;
  const bots: Bot[] = [];

  beforeAll(async () => {
    srv = await startServer({ port: 0, manager: { catchUpLimit: 90 } });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  afterAll(async () => {
    bots.forEach((b) => b.close());
    await srv.close();
  });

  async function newBot(name: string): Promise<Bot> {
    const b = new Bot(url, name);
    bots.push(b);
    await b.open();
    return b;
  }

  it('hosts a room, plays in lockstep, accepts a late joiner via snapshot and a rejoin after a dropped socket', async () => {
    const host = await newBot('host');
    host.session.create('host', 'smg');
    await until(() => host.session.code !== '', 3000, 'room code');
    const guest = await newBot('guest');
    guest.session.join(host.session.code, 'guest', 'ar');
    await until(() => host.session.players.length === 2, 3000, 'guest in lobby');
    host.session.setOptions(1, 1);
    await sleep(150);
    expect(guest.session.options.map).toBe(1);
    host.run();
    guest.run();
    host.session.start();
    await until(() => host.session.state === 'playing' && guest.session.state === 'playing', 3000, 'game start');

    // 5 s of play, then a third player arrives late (history above the snapshot limit)
    await sleep(5000);
    const late = await newBot('late');
    late.session.join(host.session.code, 'late', 'pistol');
    late.run();
    await until(() => late.session.state === 'playing' && !!late.session.world && late.session.applied > 0, 6000, 'late joiner running');
    expect(late.session.resyncs).toBeGreaterThan(0); // got a snapshot, not 150+ ticks of history

    // the guest's socket dies; a new connection takes the slot back with the token
    const token = guest.session.token;
    const slot = guest.session.slot;
    guest.close();
    await sleep(1200);
    const back = await newBot('guest2');
    back.session.rejoin(host.session.code, token);
    back.run();
    await until(() => back.session.state === 'playing' && !!back.session.world && back.session.applied > 0, 6000, 'rejoined player running');
    expect(back.session.slot).toBe(slot);
    expect(back.session.resyncs).toBeGreaterThan(0);

    await sleep(4000);
    // every client that was alive at a checkpoint saw the same world state
    const all = [host, late, back];
    let compared = 0;
    for (const [tick, h] of host.hashes) {
      for (const o of all.slice(1)) {
        const x = o.hashes.get(tick);
        if (x === undefined) continue;
        expect(x, `tick ${tick} ${o.name}`).toBe(h);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(5);
    for (const b of all) expect(b.session.desyncTicks.length).toBe(0);
    expect(host.session.world!.pActive[slot]).toBe(1);
  }, 60_000);

  it('serves a 404 for unknown files and refuses junk without dying', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/nope.txt`);
    expect(res.status).toBe(404);
    const b = await newBot('junk');
    for (const m of ['{', '{"t":"join","code":{}}', 'x'.repeat(3000)]) b.ws.send(m);
    b.ws.send(new Uint8Array(4));
    await sleep(200);
    b.session.create('after junk');
    await until(() => b.session.code !== '', 3000, 'room after junk');
  });
  it('reports its version and refuses a client from another major.minor with a clear message', async () => {
    const info = (await (await fetch(`http://127.0.0.1:${srv.port}/version.json`)).json()) as { version: string };
    expect(info.version).toBe(GAME_VERSION);

    const old = await newBot('old');
    const errors: string[] = [];
    old.ws.on('message', (d, bin) => {
      if (!bin) {
        const m = JSON.parse(d.toString()) as { t: string; message?: string };
        if (m.t === 'error') errors.push(m.message ?? '');
      }
    });
    old.ws.send(JSON.stringify({ t: 'create', name: 'old', v: '0.0.1' }));
    await until(() => errors.length > 0, 3000, 'version error');
    expect(errors[0]).toMatch(/version mismatch/);
    expect(old.session.code).toBe('');

    // a patch difference is fine
    const [maj, min] = GAME_VERSION.split('.');
    const near = await newBot('near');
    near.ws.send(JSON.stringify({ t: 'create', name: 'near', v: `${maj}.${min}.99` }));
    await until(() => near.session.code !== '', 3000, 'room for a patch-level different client');
  });

  it('keeps the colour a player picked and ignores nonsense colours', async () => {
    const a = await newBot('a');
    a.session.create('a', 'pistol', { color: 4 });
    await until(() => a.session.code !== '', 3000, 'room');
    const b = await newBot('b');
    b.session.join(a.session.code, 'b', 'pistol', { color: 99 });
    await until(() => a.session.players.length === 2, 3000, 'second player');
    expect(a.session.players.find((p) => p.slot === a.session.slot)!.color).toBe(4);
    expect(a.session.players.find((p) => p.slot === b.session.slot)!.color).toBe(-1);
    b.session.setLook(2, 7);
    await until(() => a.session.players.find((p) => p.slot === b.session.slot)!.color === 7, 3000, 'look update');
  });
});
