import { GAME_VERSION, INPUT_DELAY_TICKS, WEAPON_IDS, TICK_DT, type PlayerInput, type WeaponId } from '@wrh/shared';
import { CHECKPOINT_TICKS, createGame, hashWorld, joinPlayer, restoreWorld, serializeWorld, step, type World } from '@wrh/sim';
import { Bin, decodeBundle, decodeSnapshot, encodeInputMsg, encodeSnapshot, type Bundle, type ClientMsg, type JoinOpts, type PlayerInfo, type RoomOptions, type ServerMsg } from './protocol';

export interface Transport {
  send(data: string | Uint8Array): void;
}

export type NetState = 'idle' | 'lobby' | 'playing' | 'closed';

/** Max bundles applied per `pump` call when catching up (smooths bursts and late-join fast forward). */
const MAX_STEPS_PER_PUMP = 6;
const MAX_SLOTS = 11;

/**
 * Client side of the lockstep protocol: sends this player's inputs tagged for a future tick, buffers the confirmed
 * bundles from the server and applies them to the local simulation in strict tick order.
 */
export class NetSession {
  state: NetState = 'idle';
  code = '';
  slot = -1;
  players: PlayerInfo[] = [];
  options: RoomOptions = { map: 0, difficulty: 1 };
  /** Secret for rejoining this slot after a dropped connection (kept by the page in sessionStorage). */
  token = '';
  locked = false;
  world: World | null = null;
  error = '';
  /** Slots reported as diverged by the server (desync detection). */
  desyncTicks: number[] = [];
  rttMs = 60;
  /** Last confirmed tick applied to the world. */
  applied = -1;
  /** Highest tick whose bundle has arrived. */
  received = -1;
  /** Bundles stepped by the last pump (events of the last one are in world.events). */
  lastSteps = 0;
  private readonly bundles = new Map<number, Bundle>();
  /** Recently applied bundles, kept so a restored snapshot can be rolled forward again. */
  private readonly history = new Map<number, Bundle>();
  private lastResync = -1e9;
  /** Number of snapshots this client restored (diagnostics). */
  resyncs = 0;
  private weapon: WeaponId = 'pistol';
  /** True while the host has the game paused. */
  paused = false;
  private pendingStart: { seed: number; players: { slot: number; weapon: WeaponId; cls: number }[] } | null = null;
  private nextPing = 0;

  constructor(
    private readonly transport: Transport,
    private readonly clock: () => number = Date.now,
  ) {}

  private sendJson(m: ClientMsg): void {
    this.transport.send(JSON.stringify(m));
  }

  create(name: string, weapon: WeaponId = 'pistol', opts: JoinOpts = {}): void {
    this.weapon = weapon;
    this.sendJson({ t: 'create', name, weapon, v: GAME_VERSION, ...opts });
  }

  join(code: string, name: string, weapon: WeaponId = 'pistol', opts: JoinOpts = {}): void {
    this.weapon = weapon;
    this.sendJson({ t: 'join', code, name, weapon, v: GAME_VERSION, ...opts });
  }

  /** Reattach to a slot after the connection dropped (token from an earlier `room` message). */
  rejoin(code: string, token: string): void {
    this.sendJson({ t: 'rejoin', code, token, v: GAME_VERSION });
  }

  /** Host only, before the game starts. */
  setOptions(map: number, difficulty: number): void {
    this.sendJson({ t: 'options', map, difficulty });
  }

  setLook(acc: number, color = -1, cls = 0): void {
    this.sendJson({ t: 'look', acc, color, cls });
  }

  start(): void {
    this.sendJson({ t: 'start' });
  }

  /** Host only: pause or resume the game for everybody. */
  setPause(on: boolean): void {
    this.sendJson({ t: 'pause', on });
  }

  /** Pick the starting weapon while in the lobby. */
  setWeapon(weapon: WeaponId): void {
    this.weapon = weapon;
    this.sendJson({ t: 'weapon', weapon });
  }

  leave(): void {
    this.sendJson({ t: 'leave' });
    this.state = 'closed';
  }

  /** Feed one message from the transport. */
  onMessage(data: string | Uint8Array): void {
    if (typeof data !== 'string') {
      if (data[0] === Bin.Bundle) {
        const b = decodeBundle(data, MAX_SLOTS);
        this.bundles.set(b.tick, b);
        if (b.tick > this.received) this.received = b.tick;
      } else if (data[0] === Bin.SnapshotDeliver && this.world) {
        this.applySnapshot(data);
      }
      return;
    }
    const m = JSON.parse(data) as ServerMsg;
    switch (m.t) {
      case 'room':
        this.code = m.code;
        this.slot = m.slot;
        this.players = m.players;
        this.options = m.options;
        this.token = m.token;
        this.locked = m.locked;
        if (this.state === 'idle') this.state = m.started ? 'playing' : 'lobby';
        break;
      case 'start':
        this.paused = false;
        this.pendingStart = { seed: m.seed, players: m.players };
        this.world = createGame({ seed: m.seed, players: m.players, map: m.map, difficulty: m.difficulty });
        this.history.clear();
        this.bundles.clear();
        this.received = -1;
        this.applied = -1;
        this.state = 'playing';
        break;
      case 'desync':
        this.desyncTicks.push(m.tick);
        if (m.slots.includes(this.slot) && this.clock() - this.lastResync > 3000) {
          this.lastResync = this.clock();
          this.sendJson({ t: 'resync' });
        }
        break;
      case 'snapshotRequest':
        if (this.world && this.state === 'playing') this.transport.send(encodeSnapshot(Bin.Snapshot, this.world.tick, serializeWorld(this.world)));
        break;
      case 'paused':
        this.paused = m.on === true;
        break;
      case 'pong':
        this.rttMs = this.rttMs * 0.8 + (this.clock() - m.ts) * 0.2;
        break;
      case 'error':
        this.error = m.message;
        break;
    }
  }

  /** The tick a new local input should be tagged with so it arrives in time. */
  inputTick(): number {
    const lead = Math.min(15, Math.max(INPUT_DELAY_TICKS, Math.ceil(this.rttMs / (TICK_DT * 1000)) + 2));
    return Math.max(this.received, this.applied) + lead;
  }

  sendInput(input: PlayerInput): void {
    if (this.state !== 'playing') return;
    this.transport.send(encodeInputMsg(this.inputTick(), input));
  }

  private applySnapshot(buf: Uint8Array): void {
    const w = this.world!;
    const { tick, data } = decodeSnapshot(buf);
    restoreWorld(w, data);
    this.applied = tick - 1;
    this.resyncs++;
    // roll forward from the snapshot using the stored history
    for (const [t, b] of this.history) if (t >= tick) this.bundles.set(t, b);
  }

  /** Apply as many confirmed ticks as are available. Returns the number of ticks stepped. */
  pump(max = MAX_STEPS_PER_PUMP, hooks?: { before?: (w: World) => void; after?: (w: World) => void }): number {
    const w = this.world;
    if (!w || this.state !== 'playing') return 0;
    let n = 0;
    const behind = this.received - this.applied;
    const budget = behind > 120 ? 600 : max;
    while (n < budget) {
      const b = this.bundles.get(this.applied + 1);
      if (!b) break;
      this.bundles.delete(b.tick);
      this.history.set(b.tick, b);
      this.history.delete(b.tick - 900);
      for (const j of b.joins) joinPlayer(w, j.slot, WEAPON_IDS[j.weaponIndex]!, j.cls);
      hooks?.before?.(w);
      step(w, b.inputs);
      hooks?.after?.(w);
      this.applied = b.tick;
      n++;
      if (w.tick % CHECKPOINT_TICKS === 0 && this.received - this.applied < 60) {
        this.sendJson({ t: 'hash', tick: w.tick, hash: hashWorld(w) });
      }
    }
    this.lastSteps = n;
    const now = this.clock();
    if (now >= this.nextPing) {
      this.nextPing = now + 2000;
      this.sendJson({ t: 'ping', ts: now });
    }
    return n;
  }

  get backlog(): number {
    return this.received - this.applied;
  }
}
