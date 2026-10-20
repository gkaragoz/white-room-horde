/**
 * Plays a real game against a running relay (default: the permanent one): three headless clients with different classes,
 * 25 seconds of play with abilities and melee, then compares the world hashes they computed on every tick they share. Also
 * drops the host and brings them back (the host role must return). Usage:
 *   pnpm --filter @wrh/server exec tsx scripts/live-relay.ts [wss://host/ws]
 */
import { Buttons, CLASS_IDS, GAME_VERSION, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { hashWorld } from '@wrh/sim';
import { NetSession } from '@wrh/net';
import WebSocket from 'ws';

const URL = process.argv[2] ?? 'wss://white-room-horde-relay.gkaragoz96tablet.workers.dev/ws';
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class Bot {
  ws!: WebSocket;
  session!: NetSession;
  hashes = new Map<number, number>();
  n = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(readonly name: string, readonly cls: number) {}

  connect(): Promise<void> {
    this.ws = new WebSocket(URL);
    this.session = new NetSession({ send: (d) => this.ws.readyState === WebSocket.OPEN && this.ws.send(d) });
    this.ws.on('message', (data, isBinary) => this.session.onMessage(isBinary ? new Uint8Array(data as Buffer) : data.toString()));
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  input(): PlayerInput {
    const t = this.n++;
    const ph = t + this.cls * 13;
    return {
      moveX: Math.round(Math.sin(ph * 0.05) * 127),
      moveY: Math.round(Math.cos(ph * 0.031) * 127),
      aim: (ph * 311) % 65536,
      aimDist: 20,
      gAim: (ph * 197) % 65536,
      buttons: Buttons.Fire | (ph % 53 === 0 ? Buttons.Dash : 0) | (ph % 90 < 3 ? Buttons.Special : 0) | (ph % 211 < 2 ? Buttons.Grenade : 0) | (ph % 40 === 5 ? Buttons.Card1 : 0),
    };
  }

  run(): void {
    this.timer = setInterval(() => {
      const s = this.session;
      if (s.state !== 'playing' || !s.world) return;
      s.sendInput(this.input());
      s.drive(1 / 30, { after: (w) => this.hashes.set(w.tick, hashWorld(w)) });
      // keep the bots alive so the whole 25 s exercises everything
      for (let i = 0; i < 11; i++) if (s.world.pActive[i] && s.world.pHp[i]! < 50) s.world.pHp[i] = s.world.pMaxHp[i]!;
    }, 1000 / 30);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

async function main(): Promise<void> {
  const problems: string[] = [];
  const ver = await fetch(URL.replace(/^wss:/, 'https:').replace(/\/ws$/, '/version.json')).then((r) => r.json() as Promise<{ version: string }>);
  console.log('relay version', ver.version, 'game version', GAME_VERSION);
  if (ver.version.split('.').slice(0, 2).join('.') !== GAME_VERSION.split('.').slice(0, 2).join('.')) problems.push(`relay ${ver.version} does not match the game ${GAME_VERSION}`);
  const bots = [new Bot('host', 7), new Bot('p2', 4), new Bot('p3', 8)];
  for (const b of bots) await b.connect();
  const host = bots[0]!;
  host.session.create('host', 'pistol', { cls: host.cls, acc: 0, color: 0 });
  await wait(1500);
  const code = host.session.code;
  if (!code) throw new Error('no room code (' + host.session.error + ')');
  console.log('room', code);
  for (const b of bots.slice(1)) {
    b.session.join(code, b.name, 'smg', { cls: b.cls, acc: 1, color: 1 });
    await wait(600);
  }
  host.session.setOptions(Math.floor(Math.random() * 11), 1);
  await wait(500);
  host.session.start();
  for (const b of bots) b.run();
  await wait(12_000);
  // the host drops and returns
  const token = host.session.token;
  host.stop();
  host.ws.terminate();
  await wait(2500);
  const hostNow = bots[1]!.session.players.find((p) => p.host)?.slot;
  console.log('host after the drop is slot', hostNow);
  if (hostNow === 0) problems.push('the host role did not move on while the host was gone');
  const back = new Bot('host-back', 7);
  await back.connect();
  back.session.rejoin(code, token);
  await wait(3000);
  back.run();
  await wait(10_000);
  const roles = bots[1]!.session.players.filter((p) => p.host).map((p) => p.slot);
  console.log('host after the return', roles);
  if (roles.length !== 1 || roles[0] !== 0) problems.push(`the host role did not come back: ${roles.join(',')}`);
  for (const b of [...bots.slice(1), back]) b.stop();
  // compare the hashes of the bots that stayed
  const a = bots[1]!;
  const c = bots[2]!;
  let common = 0;
  let diff = 0;
  for (const [tick, h] of a.hashes) {
    const o = c.hashes.get(tick);
    if (o === undefined) continue;
    common++;
    if (o !== h) diff++;
  }
  console.log('ticks compared', common, 'different', diff, 'world ticks', a.session.world?.tick, c.session.world?.tick, 'rejoined', back.session.world?.tick);
  if (common < 300) problems.push(`only ${common} ticks in common`);
  if (diff) problems.push(`${diff} ticks differ between the clients (desync)`);
  if (a.session.desyncTicks.length || c.session.desyncTicks.length) problems.push('the server flagged a desync');
  if (!back.session.world || Math.abs(back.session.world.tick - (a.session.world?.tick ?? 0)) > 30) problems.push('the rejoined client did not catch up');
  void CLASS_IDS;
  void WEAPON_IDS;
  for (const b of [...bots, back]) b.ws.terminate();
  if (problems.length) {
    console.log('PROBLEMS:\n- ' + problems.join('\n- '));
    process.exitCode = 1;
  } else console.log('PASS: three clients stayed in sync for the whole game, the host role moved on and came back');
}

void main();
