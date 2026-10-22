import { DEFAULT_GAME_OPTIONS, GAME_VERSION, Buttons, INPUT_BYTES, MAP_COUNT, MAX_LEVEL, DRONE_TYPES, poolAt, withOptions, CLASS_IDS, MAX_PLAYERS, NO_INPUT, PLAYER_COLORS, TICK_RATE, WEAPON_IDS, clampInput, compatibleVersions, type PlayerInput, type WeaponId } from '@wrh/shared';
import { BOT_SKILLS, Bin, DEFAULT_BOT_SKILL, decodeBotInputsMsg, decodeInputMsg, decodeInputsMsg, decodeSnapshot, encodeBundle, encodeSnapshot, type BotInput, type BotSkill, type Bundle, type StartPlayer, type ClientMsg, type PlayerInfo, type RoomOptions, type ServerMsg } from './protocol';

/** Anything the server can write to: a WebSocket in production, a fake in tests. */
export interface Conn {
  send(data: string | Uint8Array): void;
  close?(): void;
}

interface Member {
  slot: number;
  name: string;
  host: boolean;
  /** Was the host when the connection dropped: gets the role back on returning. */
  lostHost?: boolean;
  conn: Conn | null;
  weapon: WeaponId;
  acc: number;
  color: number;
  cls: number;
  /** Meta level and what the player has met (see JoinOpts). */
  lvl: number;
  metW: number;
  metD: number;
  /** Secret that lets this player reattach to the slot after a dropped connection. */
  token: string;
  /** Set once the member is part of the running simulation (join command emitted). */
  joined: boolean;
  /** Input tagged by target tick, and the last one that was applied. */
  pending: Map<number, PlayerInput>;
  last: PlayerInput | undefined;
  /** Ticks in a row without a fresh input (a stalled or backgrounded tab). */
  miss?: number;
  /** Round trip time the client measured (ms), reported with its pings: used to pick the snapshot donor. */
  rtt?: number;
  /** Messages waiting to go out (catch-up history, then the live bundles behind it), drained a few hundred per relay tick. */
  outbox?: (string | Uint8Array)[];
  outPos?: number;
  /**
   * A companion bot: it has no connection, takes part in the game for as long as the room lives and is never "disconnected". Its inputs
   * are sent by the host's connection (see `botInputs`); without them it stands still like a player who went away.
   */
  bot?: boolean;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Anyone arriving later than this many ticks into the game gets a snapshot instead of the whole history. */
export const DEFAULT_CATCHUP_LIMIT = 450;
/** Under the 1 MiB a Cloudflare WebSocket message may carry (a bigger upload would kill the connection, not just be refused). */
const MAX_SNAPSHOT_BYTES = 900_000;
/** Bundles (tiny messages) a returning player is sent per relay tick: a 10 000 tick game takes about a second, not one frozen burst. */
const DRAIN_PER_TICK = 300;
/** Ticks a snapshot donor has to answer before the asker is given the whole history instead (5 s). */
const SNAPSHOT_TIMEOUT_TICKS = 150;
const MAX_AHEAD_TICKS = 300;
/** While the game is paused no input is kept that is further ahead than this (a page that does not know yet keeps sending). */
const PAUSED_AHEAD_TICKS = 60;

/** A client's input as the relay accepts it: in range, and without the Away flag (only the relay may say a player is away). */
function cleanInput(i: PlayerInput): PlayerInput {
  const c = clampInput(i);
  return { ...c, buttons: c.buttons & ~Buttons.Away };
}

function randomToken(): string {
  let s = '';
  for (let i = 0; i < 24; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

interface SnapJob {
  /** Who asked for it (the target) and who was asked to upload it. */
  slot: number;
  donor: number;
  /** Room clock (relay ticks) when it was requested. */
  at: number;
  /** Also send the bundles after the snapshot (a joiner or returning player); a resync only needs the state. */
  history: boolean;
}

export class Room {
  readonly members: (Member | null)[] = new Array<Member | null>(MAX_PLAYERS).fill(null);
  started = false;
  tick = 0;
  seed = 0;
  options: RoomOptions = { ...DEFAULT_GAME_OPTIONS };
  /** The layout actually in use once the game has started. */
  map = 0;
  password = '';
  /** Manager tick of the last message from anybody (for idle clean-up). */
  lastActive = 0;
  /** Every bundle sent so far (index = tick), for late joiners. */
  readonly history: Uint8Array[] = [];
  private pendingJoins: Bundle['joins'] = [];
  private readonly votes = new Map<number, Map<number, number>>();
  /** Slots whose last hash vote disagreed with the rest (they get a snapshot, and never upload one). */
  readonly diverged = new Set<number>();
  private readonly jobs: SnapJob[] = [];
  /** Relay ticks seen by this room (also while paused): the clock for snapshot timeouts. */
  private clockTicks = 0;
  private startPlayers: StartPlayer[] = [];
  /** The meta level the game started at: the lowest in the room. Players joining later play at it too. */
  level = MAX_LEVEL;
  /** The difficulty multipliers actually in use: the host's choice limited to what that level has opened. */
  mods = 0;

  constructor(
    readonly code: string,
    private readonly catchUpLimit = DEFAULT_CATCHUP_LIMIT,
  ) {}

  /** The ladder step the companion bots of this room play at (the host's client reads it back to drive them). */
  botSkill: BotSkill = DEFAULT_BOT_SKILL;

  private info(): PlayerInfo[] {
    const out: PlayerInfo[] = [];
    for (const m of this.members) if (m) out.push({ slot: m.slot, name: m.name, host: m.host, connected: m.conn !== null || m.bot === true, weapon: m.weapon, acc: m.acc, color: m.color, cls: m.cls, lvl: m.lvl, ...(m.bot ? { bot: true } : {}) });
    return out;
  }

  /** The people in the room (everything but the bots). */
  get humans(): Member[] {
    return this.members.filter((m): m is Member => m !== null && !m.bot);
  }

  /** Slots a bot may take (empty ones) plus the ones bots hold now: what the host may fill with companions. */
  get botCapacity(): number {
    let n = 0;
    for (const m of this.members) if (m === null || m.bot) n++;
    return n;
  }

  /**
   * Host only, lobby only: replace the companion bots by `list` ([class, weapon, name]), in the lowest free slots, as many as fit.
   * Returns the number placed.
   */
  setBots(list: readonly [number, WeaponId, string][], skill: BotSkill): number {
    if (this.started) return 0;
    for (let s = 0; s < this.members.length; s++) if (this.members[s]?.bot) this.members[s] = null;
    this.botSkill = BOT_SKILLS.includes(skill) ? skill : DEFAULT_BOT_SKILL;
    let n = 0;
    for (const [cls, weapon, name] of list) {
      const slot = this.members.findIndex((m) => m === null);
      if (slot < 0) break;
      this.members[slot] = { slot, name: name.slice(0, 16) || 'bot', host: false, conn: null, weapon, acc: 0, color: -1, cls, lvl: MAX_LEVEL, metW: -1, metD: -1, token: randomToken(), joined: false, pending: new Map(), last: undefined, bot: true };
      n++;
    }
    this.broadcastRoom();
    return n;
  }

  broadcastRoom(): void {
    for (const m of this.members) {
      if (m?.conn) {
        send(m.conn, { t: 'room', code: this.code, slot: m.slot, players: this.info(), started: this.started, options: this.options, token: m.token, locked: this.password !== '', botSkill: this.botSkill });
      }
    }
  }

  /** The room message for one connection (its slot, token and the players): a returning page needs it before anything else. */
  private sendRoomTo(m: Member): void {
    if (m.conn) send(m.conn, { t: 'room', code: this.code, slot: m.slot, players: this.info(), started: this.started, options: this.options, token: m.token, locked: this.password !== '', botSkill: this.botSkill });
  }

  private sendStart(conn: Conn): void {
    send(conn, { t: 'start', seed: this.seed, players: this.startPlayers, map: this.map, mods: this.mods, level: this.level });
    if (this.paused) send(conn, { t: 'paused', on: true });
  }

  add(conn: Conn, name: string, weapon: WeaponId, acc = 0, color = -1, cls = 0, lvl = MAX_LEVEL, metW = -1, metD = -1): Member | null {
    let slot = this.members.findIndex((m) => m === null);
    if (slot < 0 && !this.started) {
      // a full lobby: the last companion makes room for the person
      for (let s = this.members.length - 1; s >= 0; s--) {
        if (this.members[s]?.bot) {
          this.members[s] = null;
          slot = s;
          break;
        }
      }
    }
    if (slot < 0) return null;
    const host = this.humans.length === 0;
    const m: Member = { slot, name: name.slice(0, 16) || 'player', host, conn, weapon, acc, color, cls, lvl, metW, metD, token: randomToken(), joined: false, pending: new Map(), last: undefined };
    this.members[slot] = m;
    if (this.started) {
      // late join: add the player at the next tick and bring the client up to date
      this.pendingJoins.push({ slot, weaponIndex: WEAPON_IDS.indexOf(weapon), cls, metWeapons: metW, metDrones: metD });
      m.joined = true;
      this.sendStart(conn);
      this.catchUp(m);
    }
    return m;
  }

  /** A returning player reattaches to the slot their token belongs to. */
  rejoin(conn: Conn, token: string, have?: number): Member | null {
    const m = this.members.find((x) => x && x.token === token) ?? null;
    if (!m) return null;
    if (m.conn && m.conn !== conn) m.conn.close?.();
    m.conn = conn;
    m.pending.clear();
    m.outbox = [];
    m.outPos = 0;
    this.dropJobs(m.slot);
    if (m.lostHost) {
      // the host who dropped comes back: the temporary host hands the role back
      m.lostHost = false;
      for (const x of this.members) if (x && x !== m) x.host = false;
      m.host = true;
    }
    if (this.started) {
      this.sendRoomTo(m); // before `start`: the page must know its slot as soon as it has a world
      const resumable = typeof have === 'number' && Number.isInteger(have) && have >= -1 && have < this.history.length;
      if (resumable) {
        // the page kept its world: no new game, only the ticks after the last one it applied
        if (this.paused) send(conn, { t: 'paused', on: true });
        this.queueHistory(m, have + 1);
      } else {
        this.sendStart(conn);
        this.catchUp(m);
      }
    }
    return m;
  }

  /** A slot's snapshot jobs are void when it leaves or returns; an asker whose donor vanished is given the history instead. */
  private dropJobs(slot: number): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]!;
      if (j.slot !== slot && j.donor !== slot) continue;
      this.jobs.splice(i, 1);
      const target = this.members[j.slot];
      if (j.donor === slot && j.slot !== slot && j.history && target?.conn) this.queueHistory(target, 0);
    }
  }

  /** Queue `history[from..]` for a member (sent a few hundred per relay tick, in order, ahead of the live bundles). */
  private queueHistory(m: Member, from: number): void {
    const box = (m.outbox ??= []);
    for (let t = from; t < this.history.length; t++) box.push(this.history[t]!);
  }

  /** Put one message in a member's line: straight out when nothing is waiting, else behind what is (order is everything here). */
  private deliver(m: Member, data: string | Uint8Array): void {
    if (!m.conn) return;
    if (m.outbox && m.outPos !== undefined && m.outPos < m.outbox.length) m.outbox.push(data);
    else if (m.outbox && m.outbox.length > 0) m.outbox.push(data);
    else m.conn.send(data);
  }

  /** Send a returning player's queue, a few hundred messages per call. */
  private flush(m: Member): void {
    const box = m.outbox;
    if (!box || !m.conn) return;
    let pos = m.outPos ?? 0;
    for (let n = 0; n < DRAIN_PER_TICK && pos < box.length; n++) m.conn.send(box[pos++]!);
    if (pos >= box.length) {
      box.length = 0;
      pos = 0;
    }
    m.outPos = pos;
  }

  /** Once per relay tick, paused or not: drain the queues and give up on snapshot donors that stay silent. */
  drain(): void {
    this.clockTicks++;
    for (const m of this.members) if (m?.outbox?.length) this.flush(m);
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]!;
      if (this.clockTicks - j.at < SNAPSHOT_TIMEOUT_TICKS) continue;
      this.jobs.splice(i, 1);
      const target = this.members[j.slot];
      if (j.history && target?.conn) this.queueHistory(target, 0); // no donor answered: the whole history, paced
    }
  }

  /**
   * Who uploads a snapshot: a connected, healthy member other than the one asking, preferring the best connection and
   * (when there is a choice) not the host, who already carries the most.
   */
  pickDonor(exceptSlot: number): Member | undefined {
    let best: Member | undefined;
    let bestCost = Infinity;
    for (const m of this.members) {
      if (!m?.conn || !m.joined || m.slot === exceptSlot || this.diverged.has(m.slot)) continue;
      const cost = (m.rtt ?? 150) + (m.host ? 120 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = m;
      }
    }
    return best;
  }

  /** Send a client the history it missed: all of it for young games, otherwise a donor's snapshot plus what came after. */
  private catchUp(m: Member): void {
    if (!m.conn) return;
    if (this.history.length <= this.catchUpLimit) {
      this.queueHistory(m, 0);
      return;
    }
    const donor = this.pickDonor(m.slot);
    if (!donor?.conn) {
      this.queueHistory(m, 0);
      return;
    }
    this.jobs.push({ slot: m.slot, donor: donor.slot, at: this.clockTicks, history: true });
    send(donor.conn, { t: 'snapshotRequest' });
  }

  setOptions(o: Partial<RoomOptions>): void {
    if (this.started) return;
    this.options = withOptions(this.options, o);
    this.broadcastRoom();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.seed = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
    // the room plays at its lowest level: the pool, the arenas and the difficulty multipliers are the ones that level has opened
    this.level = MAX_LEVEL;
    for (const m of this.members) if (m) this.level = Math.min(this.level, m.lvl);
    const pool = poolAt(this.level);
    this.mods = this.options.mods & pool.mods;
    const open: number[] = [];
    for (let a = 0; a < MAP_COUNT; a++) if ((pool.arenas >> a) & 1) open.push(a);
    const chosen = this.options.map;
    this.map = chosen >= 0 && open.includes(chosen) ? chosen : open[Math.floor(Math.random() * open.length)]!;
    this.startPlayers = [];
    for (const m of this.members) {
      if (!m) continue;
      m.joined = true;
      this.startPlayers.push({ slot: m.slot, weapon: m.weapon, cls: m.cls, metWeapons: m.metW, metDrones: m.metD });
    }
    for (const m of this.members) if (m?.conn) this.sendStart(m.conn);
    this.broadcastRoom();
  }

  disconnect(slot: number, conn?: Conn): void {
    const m = this.members[slot];
    if (!m) return;
    if (conn && m.conn !== conn) return; // an old connection closing after a rejoin
    m.conn = null;
    m.pending.clear();
    m.last = undefined;
    m.outbox = [];
    m.outPos = 0;
    this.dropJobs(slot);
    if (!this.started) {
      // lobby: free the slot and hand the host role on (to a person, never to a bot)
      this.members[slot] = null;
      if (m.host) {
        const next = this.members.find((x) => x && !x.bot);
        if (next) next.host = true;
      }
      if (this.humans.length === 0) for (let s = 0; s < this.members.length; s++) this.members[s] = null; // nobody left to play with
    } else if (m.host) {
      const next = this.members.find((x) => x?.conn);
      if (next) {
        m.host = false;
        m.lostHost = true;
        next.host = true;
      }
    }
    this.broadcastRoom();
  }

  get empty(): boolean {
    return this.members.every((m) => m === null || m.conn === null);
  }

  input(slot: number, tick: number, input: PlayerInput): void {
    const m = this.members[slot];
    if (!m || tick < this.tick || tick > this.tick + (this.paused ? PAUSED_AHEAD_TICKS : MAX_AHEAD_TICKS)) return; // too late (the previous input stays) or absurdly early
    m.pending.set(tick, cleanInput(input));
  }

  /** The newest input of a message and the repeated older ones: an older one only fills a tick that has no input yet. */
  inputs(slot: number, tick: number, list: readonly PlayerInput[]): void {
    const m = this.members[slot];
    if (!m) return;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const t = tick - (n - 1 - i);
      if (t < this.tick || t > this.tick + (this.paused ? PAUSED_AHEAD_TICKS : MAX_AHEAD_TICKS)) continue;
      if (i === n - 1) m.pending.set(t, cleanInput(list[i]!));
      else if (!m.pending.has(t)) {
        m.pending.set(t, cleanInput(list[i]!));
        this.repairs++;
      }
    }
  }

  /**
   * The inputs of companion bots, sent by the host's connection: only slots that hold a bot are taken, the rest of the message is
   * ignored. Same window and cleaning as a person's input; a bot input may also never carry the Away flag.
   */
  botInputs(from: number, tick: number, list: readonly BotInput[]): void {
    if (!this.started || !this.members[from]?.host) return;
    if (tick < this.tick || tick > this.tick + (this.paused ? PAUSED_AHEAD_TICKS : MAX_AHEAD_TICKS)) return;
    for (const b of list) {
      const m = Number.isInteger(b.slot) ? this.members[b.slot] : null;
      if (!m?.bot) continue;
      m.pending.set(tick, cleanInput(b.input));
    }
  }

  /** Inputs that arrived only through the repeats of a later message (a lost or late message made good). */
  repairs = 0;

  hash(slot: number, tick: number, hash: number): void {
    let v = this.votes.get(tick);
    if (!v) {
      v = new Map();
      this.votes.set(tick, v);
    }
    v.set(slot, hash >>> 0);
    let expected = 0;
    for (const m of this.members) if (m?.conn && m.joined) expected++;
    if (v.size < expected) return;
    const counts = new Map<number, number>();
    for (const h of v.values()) counts.set(h, (counts.get(h) ?? 0) + 1);
    if (counts.size > 1) {
      let bestHash = 0;
      let best = -1;
      for (const [h, c] of counts) {
        if (c > best) {
          best = c;
          bestHash = h;
        }
      }
      const slots: number[] = [];
      for (const [s, h] of v) if (h !== bestHash) slots.push(s);
      for (const s of slots) this.diverged.add(s);
      for (const m of this.members) if (m?.conn) send(m.conn, { t: 'desync', tick, slots });
    }
    this.votes.delete(tick);
    for (const t of this.votes.keys()) if (t < tick - 600) this.votes.delete(t);
  }

  /** A diverged client asks for a fresh state: pick a healthy donor and have it upload a snapshot. */
  resync(slot: number): void {
    const donor = this.pickDonor(slot);
    if (!donor?.conn) return;
    if (this.jobs.some((j) => j.slot === slot && !j.history)) return; // one resync at a time per slot
    this.jobs.push({ slot, donor: donor.slot, at: this.clockTicks, history: false });
    send(donor.conn, { t: 'snapshotRequest' });
  }

  snapshot(from: number, data: Uint8Array): void {
    if (data.length > MAX_SNAPSHOT_BYTES || data.length < 6) return;
    const at = this.jobs.findIndex((j) => j.donor === from); // the answer to the job of THIS donor, not whoever is first in line
    if (at < 0) return; // nobody asked this one
    const job = this.jobs.splice(at, 1)[0]!;
    const target = this.members[job.slot];
    if (!target?.conn || from === job.slot) return;
    const { tick, data: world } = decodeSnapshot(data);
    this.deliver(target, encodeSnapshot(Bin.SnapshotDeliver, tick, world));
    this.diverged.delete(job.slot);
    if (job.history) this.queueHistory(target, tick);
  }

  /** Produce and broadcast the confirmed inputs for the current tick. Called at the tick rate. */
  /** The host stopped the game: no ticks are produced until it is resumed. */
  paused = false;

  setPaused(on: boolean): void {
    if (!this.started || this.paused === on) return;
    this.paused = on;
    // inputs queued far ahead while the game stood still would be applied minutes late: drop them, the pages tag fresh ones
    if (!on) for (const m of this.members) if (m) for (const t of m.pending.keys()) if (t > this.tick + PAUSED_AHEAD_TICKS) m.pending.delete(t);
    for (const m of this.members) if (m?.conn) send(m.conn, { t: 'paused', on });
  }

  advance(): void {
    if (!this.started || this.paused) return;
    const inputs: (PlayerInput | undefined)[] = [];
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const m = this.members[s];
      if (!m || !m.joined || (!m.conn && !m.bot)) {
        inputs.push(undefined);
        continue;
      }
      let inp = m.pending.get(this.tick);
      if (inp) {
        m.last = inp;
        m.miss = 0;
      } else {
        m.miss = (m.miss ?? 0) + 1;
        // a short gap repeats the last input (smooth); a long one means the player is gone for now: stand still, keep aim.
        // The same holds for a bot whose driver (the host's page) went away: it idles under the Away protection until it is driven again
        inp = m.last && m.miss <= 12 ? { ...m.last } : { ...NO_INPUT, aim: m.last?.aim ?? 0, buttons: Buttons.Away };
      }
      for (const t of m.pending.keys()) if (t <= this.tick) m.pending.delete(t);
      inputs.push(inp);
    }
    while (inputs.length > 0 && inputs[inputs.length - 1] === undefined) inputs.pop();
    const bundle = encodeBundle({ tick: this.tick, joins: this.pendingJoins, inputs });
    this.pendingJoins = [];
    this.history.push(bundle);
    for (const m of this.members) if (m?.conn) this.deliver(m, bundle);
    this.tick++;
  }
}

function send(conn: Conn, msg: ServerMsg): void {
  conn.send(JSON.stringify(msg));
}

interface Attached {
  room: Room;
  slot: number;
}

interface Bucket {
  tokens: number;
  last: number;
  dropped: number;
}

export interface ManagerOptions {
  catchUpLimit?: number;
  maxRooms?: number;
  /** Version this server speaks (default: the shared GAME_VERSION); a client on another major.minor is turned away. */
  version?: string;
  /** Messages per second a single connection may send (inputs are about 30 per second). */
  rate?: number;
  /** Seconds before a room nobody is connected to is deleted. */
  idleSeconds?: number;
}

function validName(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, 16) : '';
}

/** Room registry and message router. Transport agnostic: the Node server and the tests both drive it. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly attached = new Map<Conn, Attached>();
  private readonly buckets = new Map<Conn, Bucket>();
  private now = 0;
  private readonly opts: Required<ManagerOptions>;

  constructor(opts: ManagerOptions = {}) {
    this.opts = { catchUpLimit: DEFAULT_CATCHUP_LIMIT, maxRooms: 300, rate: 150, idleSeconds: 120, version: GAME_VERSION, ...opts };
  }

  /** A client with another game version would simulate different rules and desync at once: say so instead. */
  private versionOk(conn: Conn, v: unknown): boolean {
    if (typeof v === 'string' && compatibleVersions(v, this.opts.version)) return true;
    send(conn, { t: 'error', code: 'version', message: `version mismatch: this server runs ${this.opts.version}, your game is ${typeof v === 'string' ? v : 'unknown'}. Reload the page (or update) and try again.` });
    return false;
  }

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  /** Token bucket per connection: drop what exceeds the allowance and cut off connections that keep flooding. */
  private allow(conn: Conn): boolean {
    const t = performance.now();
    let b = this.buckets.get(conn);
    if (!b) {
      b = { tokens: this.opts.rate * 2, last: t, dropped: 0 };
      this.buckets.set(conn, b);
    }
    b.tokens = Math.min(this.opts.rate * 2, b.tokens + ((t - b.last) / 1000) * this.opts.rate);
    b.last = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    if (++b.dropped > this.opts.rate * 20) conn.close?.();
    return false;
  }

  /** Messages received since the start, for the /stats endpoint of the relay and the server. */
  messages = 0;

  handle(conn: Conn, data: string | Uint8Array): void {
    this.messages++;
    if (!this.allow(conn)) return;
    const a = this.attached.get(conn);
    if (a) a.room.lastActive = this.now;
    if (typeof data !== 'string') {
      if (!a) return;
      if (data[0] === Bin.Input && data.length === 5 + INPUT_BYTES) {
        const { tick, input } = decodeInputMsg(data);
        if (Number.isFinite(tick)) a.room.input(a.slot, tick, input);
      } else if (data[0] === Bin.Inputs) {
        const d = decodeInputsMsg(data);
        if (d && Number.isFinite(d.tick)) a.room.inputs(a.slot, d.tick, d.inputs);
      } else if (data[0] === Bin.BotInputs) {
        const d = decodeBotInputsMsg(data);
        if (d && Number.isFinite(d.tick)) a.room.botInputs(a.slot, d.tick, d.list);
      } else if (data[0] === Bin.Snapshot) {
        a.room.snapshot(a.slot, data);
      }
      return;
    }
    if (data.length > 600) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
    const weaponOf = (w: unknown): WeaponId => (typeof w === 'string' && (WEAPON_IDS as readonly string[]).includes(w) ? (w as WeaponId) : 'pistol');
    const colorOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < PLAYER_COLORS.length ? v : -1);
    const clsOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CLASS_IDS.length ? v : 0);
    const lvlOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_LEVEL ? v : MAX_LEVEL);
    const metWOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v & ((1 << WEAPON_IDS.length) - 1) : -1);
    const metDOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v & ((1 << DRONE_TYPES.length) - 1) : -1);
    const accOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 40 ? v : 0);
    const isHost = (): boolean => !!a && a.room.members[a.slot]?.host === true;
    switch (msg.t) {
      case 'create': {
        if (a) return;
        if (!this.versionOk(conn, msg.v)) return;
        if (this.rooms.size >= this.opts.maxRooms) return send(conn, { t: 'error', message: 'server is full' });
        const room = new Room(this.newCode(), this.opts.catchUpLimit);
        room.lastActive = this.now;
        if (typeof msg.password === 'string') room.password = msg.password.slice(0, 24);
        this.rooms.set(room.code, room);
        const m = room.add(conn, validName(msg.name), weaponOf(msg.weapon), accOf(msg.acc), colorOf(msg.color), clsOf(msg.cls), lvlOf(msg.lvl), metWOf(msg.metW), metDOf(msg.metD))!;
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'join': {
        if (a) return;
        if (!this.versionOk(conn, msg.v)) return;
        const room = this.rooms.get(String(msg.code).toUpperCase());
        if (!room) return send(conn, { t: 'error', message: 'room not found' });
        if (room.password && room.password !== msg.password) return send(conn, { t: 'error', message: 'wrong password' });
        const m = room.add(conn, validName(msg.name), weaponOf(msg.weapon), accOf(msg.acc), colorOf(msg.color), clsOf(msg.cls), lvlOf(msg.lvl), metWOf(msg.metW), metDOf(msg.metD));
        if (!m) return send(conn, { t: 'error', message: 'room is full' });
        room.lastActive = this.now;
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'rejoin': {
        if (a) return;
        if (!this.versionOk(conn, msg.v)) return;
        const room = this.rooms.get(String(msg.code).toUpperCase());
        if (!room) return send(conn, { t: 'error', message: 'cannot rejoin: the room is gone', code: 'room_gone' });
        const m = typeof msg.token === 'string' ? room.rejoin(conn, msg.token, typeof msg.have === 'number' ? msg.have : undefined) : null;
        if (!m) return send(conn, { t: 'error', message: 'cannot rejoin: this seat was given up', code: 'bad_token' });
        room.lastActive = this.now;
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'start':
        if (isHost()) a!.room.start();
        break;
      case 'options':
        if (isHost()) a!.room.setOptions({ map: msg.map, mods: msg.mods });
        break;
      case 'hash':
        if (a && Number.isFinite(msg.tick) && Number.isFinite(msg.hash)) a.room.hash(a.slot, msg.tick, msg.hash);
        break;
      case 'ping':
        if (Number.isFinite(msg.ts)) send(conn, { t: 'pong', ts: msg.ts });
        if (a && Number.isFinite(msg.rtt)) {
          const mem = a.room.members[a.slot];
          if (mem) mem.rtt = Math.max(0, Math.min(5000, msg.rtt!));
        }
        break;
      case 'resync':
        if (a) a.room.resync(a.slot);
        break;
      case 'pause':
        if (a && a.room.started && a.room.members[a.slot]?.host) a.room.setPaused(msg.on === true);
        break;
      case 'weapon':
        if (a && !a.room.started && (WEAPON_IDS as readonly string[]).includes(msg.weapon)) {
          a.room.members[a.slot]!.weapon = msg.weapon;
          a.room.broadcastRoom();
        }
        break;
      case 'look':
        if (a && !a.room.started) {
          a.room.members[a.slot]!.acc = accOf(msg.acc);
          a.room.members[a.slot]!.color = colorOf(msg.color);
          a.room.members[a.slot]!.cls = clsOf(msg.cls);
          a.room.broadcastRoom();
        }
        break;
      case 'bots':
        if (isHost() && !a!.room.started && Array.isArray(msg.list) && msg.list.length <= MAX_PLAYERS) {
          const list: [number, WeaponId, string][] = [];
          for (const e of msg.list) {
            if (!Array.isArray(e)) continue;
            list.push([clsOf(e[0]), weaponOf(e[1]), validName(e[2]) || 'bot']);
          }
          a!.room.setBots(list, msg.skill);
        }
        break;
      case 'leave':
        this.close(conn, true);
        break;
    }
  }

  /** A connection ended. `final` (the player chose to leave) forgets their slot's token in a running game. */
  close(conn: Conn, final = false): void {
    this.buckets.delete(conn);
    const a = this.attached.get(conn);
    if (!a) return;
    this.attached.delete(conn);
    a.room.disconnect(a.slot, conn);
    if (final && a.room.started) {
      const m = a.room.members[a.slot];
      if (m) m.token = randomToken(); // nobody can rejoin this slot any more
    }
    if (a.room.empty && !a.room.started) this.rooms.delete(a.room.code);
  }

  /** Advance every running room by one tick and now and then drop rooms nobody is in. */
  tick(): void {
    this.now++;
    for (const r of this.rooms.values()) {
      r.drain();
      r.advance();
    }
    if (this.now % (TICK_RATE * 15) === 0) {
      for (const [code, r] of this.rooms) {
        if (r.empty && this.now - r.lastActive > this.opts.idleSeconds * TICK_RATE) this.rooms.delete(code);
      }
    }
  }
}
