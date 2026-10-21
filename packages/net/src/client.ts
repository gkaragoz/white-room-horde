import { GAME_VERSION, INPUT_DELAY_TICKS, WEAPON_IDS, TICK_DT, type PlayerInput, type WeaponId } from '@wrh/shared';
import { CHECKPOINT_TICKS, createGame, hashWorld, joinPlayer, restoreWorld, serializeWorld, step, type World } from '@wrh/sim';
import { Bin, decodeBundle, decodeSnapshot, encodeInputsMsg, encodeSnapshot, INPUT_REDUNDANCY, type Bundle, type ClientMsg, type JoinOpts, type PlayerInfo, type RoomOptions, type ServerMsg } from './protocol';

export interface Transport {
  send(data: string | Uint8Array): void;
}

export type NetState = 'idle' | 'lobby' | 'playing' | 'closed';

/** Max bundles applied per `pump` call when catching up (smooths bursts and late-join fast forward). */
const MAX_STEPS_PER_PUMP = 6;
const MAX_SLOTS = 11;
/** How far ahead of the relay (in ticks) the newest input tag may run before it is pulled back. */
const RUNAWAY_TICKS = 15;

/**
 * Client side of the lockstep protocol: sends this player's inputs tagged for a future tick, buffers the confirmed
 * bundles from the server and applies them to the local simulation in strict tick order.
 */
export class NetSession {
  state: NetState = 'idle';
  code = '';
  slot = -1;
  players: PlayerInfo[] = [];
  options: RoomOptions = { map: 0, mods: 0 };
  /** Secret for rejoining this slot after a dropped connection (kept by the page in sessionStorage). */
  token = '';
  locked = false;
  world: World | null = null;
  error = '';
  /** Machine readable reason of the last error (room_gone, bad_token, version), empty when the relay gave none. */
  errorCode = '';
  /** Slots reported as diverged by the server (desync detection). */
  desyncTicks: number[] = [];
  /** Donate snapshots on the next turn of the event loop (the browser page); tests that run on virtual time set this off. */
  deferDonation = typeof (globalThis as { document?: unknown }).document !== 'undefined';
  rttMs = 60;
  private rttSamples = 0;
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
  private lastArrival = 0;
  /** Smoothed deviation of the bundle arrival gaps from one tick, in milliseconds. */
  jitterMs = 0;
  private playAcc = 0;

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
  rejoin(code: string, token: string, have?: number): void {
    this.sendJson({ t: 'rejoin', code, token, v: GAME_VERSION, ...(have !== undefined && have >= -1 ? { have } : {}) });
  }

  /**
   * Carry on from the session of a dropped connection: the same world, history and slot, so that nothing restarts at tick 0 and the page
   * knows its slot from the first frame. The relay then only sends the ticks after `applied`.
   */
  adopt(prev: NetSession): void {
    if (!prev.world || prev.state !== 'playing') return;
    this.world = prev.world;
    this.state = 'playing';
    this.code = prev.code;
    this.slot = prev.slot;
    this.players = prev.players;
    this.options = prev.options;
    this.token = prev.token;
    this.locked = prev.locked;
    this.applied = prev.applied;
    this.received = prev.applied; // bundles that never got applied are asked for again
    for (const [t, b] of prev.history) this.history.set(t, b);
    for (const [t, i] of prev.sent) this.sent.set(t, i);
    this.maxSent = prev.maxSent;
    this.resyncs = prev.resyncs;
    this.rttMs = prev.rttMs;
    this.rttSamples = prev.rttSamples;
    this.lead = prev.lead;
    this.lastArrival = this.clock(); // the silence watchdog counts from here
    this.adopted = true;
  }

  /** True when this session carries on from an earlier one (see `adopt`). */
  adopted = false;

  /** Host only, before the game starts. */
  setOptions(map: number, mods: number): void {
    this.sendJson({ t: 'options', map, mods });
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
        const at = this.clock();
        if (this.lastArrival > 0 && at - this.lastArrival < 1000) {
          // bundles should come every tick; how far the gaps stray from that is the jitter the playout buffer must absorb
          const dev = Math.abs(at - this.lastArrival - TICK_DT * 1000);
          this.jitterMs = this.jitterMs * 0.92 + Math.min(200, dev) * 0.08;
        }
        this.lastArrival = at;
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
        this.ping(); // measure the line while still in the lobby
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
        this.adopted = false; // the relay could not resume us: a new world from tick 0, as for a new player
        this.pendingStart = { seed: m.seed, players: m.players };
        this.world = createGame({ seed: m.seed, players: m.players, map: m.map, mods: m.mods });
        this.history.clear();
        this.bundles.clear();
        this.received = -1;
        this.applied = -1;
        this.sent.clear();
        this.maxSent = -1;
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
        // serialised right after the message handler, not inside it: the frame that is running does not wait for it
        if (this.world && this.state === 'playing') {
          const donate = (): void => {
            if (this.world && this.state === 'playing') this.transport.send(encodeSnapshot(Bin.Snapshot, this.world.tick, serializeWorld(this.world)));
          };
          if (this.deferDonation) setTimeout(donate, 0);
          else donate();
        }
        break;
      case 'paused':
        if (this.paused && m.on !== true) this.clampSent();
        if (this.paused !== (m.on === true)) {
          // no bundles arrive while the game is paused: the silence clock restarts at both ends, or the first frame after the resume would
          // see a minute without a tick and cut a healthy connection
          this.lastArrival = this.clock();
          if (!m.on) this.resumedAt = this.clock();
        }
        this.paused = m.on === true;
        break;
      case 'pong':
        {
          // the first answers set the estimate outright: the input lead depends on it from the very first tick
          const sample = this.clock() - m.ts;
          this.rttMs = this.rttSamples === 0 ? sample : this.rttMs * (this.rttSamples < 4 ? 0.6 : 0.8) + sample * (this.rttSamples < 4 ? 0.4 : 0.2);
          this.rttSamples++;
        }
        break;
      case 'error':
        this.error = m.message;
        this.errorCode = m.code ?? '';
        break;
    }
  }

  /** Input lead in ticks: follows the measured round trip and jitter, up at once and down slowly (no flapping at tick boundaries). */
  lead = INPUT_DELAY_TICKS + 1;
  private leadChangedAt = 0;
  /** How many times the lead changed (diagnostics). */
  leadChanges = 0;

  private updateLead(): void {
    const want = Math.min(15, Math.max(INPUT_DELAY_TICKS, Math.ceil((this.rttMs + 2 * this.jitterMs) / (TICK_DT * 1000)) + 3));
    const now = this.clock();
    if (want > this.lead) {
      this.lead = want;
      this.leadChangedAt = now;
      this.leadChanges++;
    } else if (want < this.lead && now - this.leadChangedAt > 3000) {
      this.lead--;
      this.leadChangedAt = now;
      this.leadChanges++;
    }
  }

  /** The tick a new local input should be tagged with so it arrives in time: never one that was used before. */
  inputTick(): number {
    this.updateLead();
    const base = Math.max(this.received, this.applied) + this.lead;
    // self-heal: a tag far ahead of the relay's tick (a pause that lasted, a stalled link, an adopted session) would be refused as
    // "absurdly early" for ever, because the tags then lead by the same distance for the rest of the game
    if (this.maxSent + 1 > base + RUNAWAY_TICKS) this.clampSent();
    return Math.max(this.maxSent + 1, base);
  }

  /** Bring the newest tag back to where the relay can use it (reused tags are fine: the relay keeps the newest input per tick). */
  private clampSent(): void {
    const base = Math.max(this.received, this.applied) + this.lead;
    if (this.maxSent < base) return;
    this.maxSent = base - 1;
    for (const t of this.sent.keys()) if (t > this.maxSent) this.sent.delete(t);
  }

  /** Wall-clock time (performance.now milliseconds) of the last input sent: the clock the local character is drawn on. */
  lastSendAt = 0;
  /** Tag of the newest input sent. */
  get sentTick(): number {
    return this.maxSent;
  }

  sendInput(input: PlayerInput): void {
    // while the game is paused the relay's tick stands still: inputs tagged ahead would pile up until the relay refuses them all
    if (this.state !== 'playing' || this.paused) return;
    const tick = this.inputTick();
    this.sent.set(tick, input);
    this.maxSent = tick;
    this.lastSendAt = typeof performance !== 'undefined' ? performance.now() : this.clock();
    // the newest input and the ones just before it (a tick without its own input of ours carries the one before)
    const recent = this.recentList;
    recent.length = 0;
    let carry: PlayerInput | undefined;
    for (let t = tick - INPUT_REDUNDANCY + 1; t <= tick && !carry; t++) carry = this.sent.get(t);
    for (let t = tick - INPUT_REDUNDANCY + 1; t <= tick; t++) {
      carry = this.sent.get(t) ?? carry;
      if (carry) recent.push(carry);
    }
    this.transport.send(encodeInputsMsg(tick, recent));
    if (this.sent.size > 64) for (const t of this.sent.keys()) if (t < this.applied) this.sent.delete(t);
  }

  private readonly recentList: PlayerInput[] = [];
  private readonly sent = new Map<number, PlayerInput>();
  private maxSent = -1;
  private readonly pendingList: PlayerInput[] = [];

  /**
   * The local inputs the confirmed world has not consumed yet, one per upcoming tick (a tick without its own input repeats
   * the one before, as the server does). The client replays them on top of the confirmed state to show its own character
   * without the network delay.
   */
  pendingInputs(): readonly PlayerInput[] {
    const list = this.pendingList;
    list.length = 0;
    const from = this.applied + 1;
    if (this.maxSent < from) return list;
    let carry: PlayerInput | undefined;
    for (let t = from; t <= this.maxSent && !carry; t++) carry = this.sent.get(t); // the window may start before our first tag
    for (let t = from; t <= this.maxSent; t++) {
      carry = this.sent.get(t) ?? carry;
      if (carry) list.push(carry);
    }
    return list;
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

  private stepOne(b: Bundle, hooks?: { before?: (w: World) => void; after?: (w: World) => void }): void {
    const w = this.world!;
    this.bundles.delete(b.tick);
    this.history.set(b.tick, b);
    this.history.delete(b.tick - 900);
    for (const j of b.joins) joinPlayer(w, j.slot, WEAPON_IDS[j.weaponIndex]!, j.cls);
    hooks?.before?.(w);
    step(w, b.inputs);
    hooks?.after?.(w);
    this.applied = b.tick;
    if (w.tick % CHECKPOINT_TICKS === 0 && this.received - this.applied < 60) {
      this.sendJson({ t: 'hash', tick: w.tick, hash: hashWorld(w) });
    }
  }

  private ping(): void {
    const now = this.clock();
    if (now >= this.nextPing) {
      this.nextPing = now + (this.rttSamples < 5 ? 400 : 2000);
      this.sendJson({ t: 'ping', ts: now, rtt: Math.round(this.rttMs) });
    }
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
      this.stepOne(b, hooks);
      n++;
    }
    this.lastSteps = n;
    this.ping();
    return n;
  }

  private playout = 2;
  private playoutChangedAt = 0;

  /** How many confirmed ticks to keep in hand: enough to ride out the measured jitter, 1 to 5. Up at once, down one step per 2 s. */
  get playoutTicks(): number {
    const want = Math.max(1, Math.min(5, Math.round(1 + this.jitterMs / 14)));
    const now = this.clock();
    if (want > this.playout) {
      this.playout = want;
      this.playoutChangedAt = now;
    } else if (want < this.playout && now - this.playoutChangedAt > 2000) {
      this.playout--;
      this.playoutChangedAt = now;
    }
    return this.playout;
  }

  /** Smoothed number of confirmed ticks in hand (the pacing controller steers this towards `playoutTicks`). */
  behindAvg = 2;
  /** The playback speed the pacing controller chose for the last call of `drive`. */
  playRate = 1;

  /** Fraction of the next tick that has elapsed (0..1) for drawing between two simulated ticks. */
  get playFraction(): number {
    return Math.min(1, this.playAcc / TICK_DT);
  }

  /** True while far behind the server (a tab that was in the background, a late join): ticks are replayed in time slices. */
  catchingUp = false;

  /**
   * Smooth playout: the simulation advances on a steady clock (a little faster when a backlog builds up, a little slower
   * when the buffer runs dry), so movement does not stutter when bundles arrive in bursts. A big backlog is replayed in
   * slices of `sliceMs` per call so the page stays responsive.
   */
  drive(dtSec: number, hooks?: { before?: (w: World) => void; after?: (w: World) => void }, sliceMs = 10): number {
    const w = this.world;
    if (!w || this.state !== 'playing') return 0;
    this.ping();
    let n = 0;
    const behind = this.received - this.applied;
    if (behind > 45) {
      this.catchingUp = true;
      // the further behind, the bigger the slice of the frame given to catching up (up to ~3.5x): a slow machine must not fall further and further behind
      const slice = Math.min(sliceMs * 3.5, sliceMs + behind * 0.4);
      const t0 = performance.now();
      while (performance.now() - t0 < slice) {
        const b = this.bundles.get(this.applied + 1);
        if (!b) break;
        this.stepOne(b, hooks);
        n++;
      }
      this.playAcc = 0;
      this.lastSteps = n;
      return n;
    }
    this.catchingUp = false;
    // the clock follows the *smoothed* buffer level: a bundle more or less in hand this frame must not speed the game up or slow it down
    const target = this.playoutTicks;
    this.behindAvg += (behind - this.behindAvg) * (1 - Math.exp(-dtSec / 0.5));
    const err = this.behindAvg - target;
    let adj = err * 0.05;
    if (err > 8) adj += (err - 8) * 0.03; // a real backlog drains faster
    const rate = 1 + Math.max(-0.15, Math.min(0.6, adj));
    this.playRate = rate;
    this.playAcc += dtSec * rate;
    while (this.playAcc >= TICK_DT && n < 8) {
      const b = this.bundles.get(this.applied + 1);
      if (!b) {
        this.playAcc = Math.min(this.playAcc, TICK_DT);
        break;
      }
      this.stepOne(b, hooks);
      this.playAcc -= TICK_DT;
      n++;
    }
    this.lastSteps = n;
    return n;
  }

  private resumedAt = 0;

  /** Milliseconds since the host resumed a paused game (a large number when it never was). */
  get sinceResumeMs(): number {
    return this.resumedAt ? this.clock() - this.resumedAt : 1e9;
  }

  /** Milliseconds since the last server tick arrived (0 before the first). */
  get sinceBundleMs(): number {
    return this.lastArrival ? this.clock() - this.lastArrival : 0;
  }

  get backlog(): number {
    return this.received - this.applied;
  }
}
