import { GAME_VERSION, INPUT_BYTES, MAP_COUNT, CLASS_IDS, MAX_PLAYERS, NO_INPUT, PLAYER_COLORS, TICK_RATE, WEAPON_IDS, clampInput, compatibleVersions, type PlayerInput, type WeaponId } from '@wrh/shared';
import { Bin, decodeInputMsg, decodeSnapshot, encodeBundle, encodeSnapshot, type ClientMsg, type PlayerInfo, type RoomOptions, type ServerMsg } from './protocol';

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
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Anyone arriving later than this many ticks into the game gets a snapshot instead of the whole history. */
export const DEFAULT_CATCHUP_LIMIT = 450;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_AHEAD_TICKS = 300;

function randomToken(): string {
  let s = '';
  for (let i = 0; i < 24; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

interface SnapJob {
  slot: number;
  /** Also send the bundles after the snapshot (a joiner or returning player); a resync only needs the state. */
  history: boolean;
}

export class Room {
  readonly members: (Member | null)[] = new Array<Member | null>(MAX_PLAYERS).fill(null);
  started = false;
  tick = 0;
  seed = 0;
  options: RoomOptions = { map: 0, difficulty: 1 };
  /** The layout actually in use once the game has started. */
  map = 0;
  password = '';
  /** Manager tick of the last message from anybody (for idle clean-up). */
  lastActive = 0;
  /** Every bundle sent so far (index = tick), for late joiners. */
  readonly history: Uint8Array[] = [];
  private pendingJoins: { slot: number; weaponIndex: number; cls: number }[] = [];
  private readonly votes = new Map<number, Map<number, number>>();
  /** Slots whose last hash vote disagreed with the rest (they get a snapshot, and never upload one). */
  readonly diverged = new Set<number>();
  private readonly jobs: SnapJob[] = [];
  private startPlayers: { slot: number; weapon: WeaponId; cls: number }[] = [];

  constructor(
    readonly code: string,
    private readonly catchUpLimit = DEFAULT_CATCHUP_LIMIT,
  ) {}

  private info(): PlayerInfo[] {
    const out: PlayerInfo[] = [];
    for (const m of this.members) if (m) out.push({ slot: m.slot, name: m.name, host: m.host, connected: m.conn !== null, weapon: m.weapon, acc: m.acc, color: m.color, cls: m.cls });
    return out;
  }

  broadcastRoom(): void {
    for (const m of this.members) {
      if (m?.conn) {
        send(m.conn, { t: 'room', code: this.code, slot: m.slot, players: this.info(), started: this.started, options: this.options, token: m.token, locked: this.password !== '' });
      }
    }
  }

  private sendStart(conn: Conn): void {
    send(conn, { t: 'start', seed: this.seed, players: this.startPlayers, map: this.map, difficulty: this.options.difficulty });
    if (this.paused) send(conn, { t: 'paused', on: true });
  }

  add(conn: Conn, name: string, weapon: WeaponId, acc = 0, color = -1, cls = 0): Member | null {
    const slot = this.members.findIndex((m) => m === null);
    if (slot < 0) return null;
    const host = this.members.every((m) => m === null);
    const m: Member = { slot, name: name.slice(0, 16) || 'player', host, conn, weapon, acc, color, cls, token: randomToken(), joined: false, pending: new Map(), last: undefined };
    this.members[slot] = m;
    if (this.started) {
      // late join: add the player at the next tick and bring the client up to date
      this.pendingJoins.push({ slot, weaponIndex: WEAPON_IDS.indexOf(weapon), cls });
      m.joined = true;
      this.sendStart(conn);
      this.catchUp(m);
    }
    return m;
  }

  /** A returning player reattaches to the slot their token belongs to. */
  rejoin(conn: Conn, token: string): Member | null {
    const m = this.members.find((x) => x && x.token === token) ?? null;
    if (!m) return null;
    if (m.conn && m.conn !== conn) m.conn.close?.();
    m.conn = conn;
    m.pending.clear();
    if (m.lostHost) {
      // the host who dropped comes back: the temporary host hands the role back
      m.lostHost = false;
      for (const x of this.members) if (x && x !== m) x.host = false;
      m.host = true;
    }
    if (this.started) {
      this.sendStart(conn);
      this.catchUp(m);
    }
    return m;
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
      for (const b of this.history) m.conn.send(b);
      return;
    }
    const donor = this.pickDonor(m.slot);
    if (!donor?.conn) {
      for (const b of this.history) m.conn.send(b);
      return;
    }
    this.jobs.push({ slot: m.slot, history: true });
    send(donor.conn, { t: 'snapshotRequest' });
  }

  setOptions(o: Partial<RoomOptions>): void {
    if (this.started) return;
    if (typeof o.map === 'number' && Number.isInteger(o.map) && o.map >= -1 && o.map < MAP_COUNT) this.options.map = o.map;
    if (typeof o.difficulty === 'number' && Number.isInteger(o.difficulty) && o.difficulty >= 0 && o.difficulty <= 2) this.options.difficulty = o.difficulty;
    this.broadcastRoom();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.seed = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
    this.map = this.options.map >= 0 ? this.options.map : Math.floor(Math.random() * MAP_COUNT);
    this.startPlayers = [];
    for (const m of this.members) {
      if (!m) continue;
      m.joined = true;
      this.startPlayers.push({ slot: m.slot, weapon: m.weapon, cls: m.cls });
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
    if (!this.started) {
      // lobby: free the slot and hand the host role on
      this.members[slot] = null;
      if (m.host) {
        const next = this.members.find((x) => x !== null);
        if (next) next.host = true;
      }
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
    if (!m || tick < this.tick || tick > this.tick + MAX_AHEAD_TICKS) return; // too late (the previous input stays) or absurdly early
    m.pending.set(tick, clampInput(input));
  }

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
    this.jobs.push({ slot, history: false });
    send(donor.conn, { t: 'snapshotRequest' });
  }

  snapshot(from: number, data: Uint8Array): void {
    if (data.length > MAX_SNAPSHOT_BYTES || data.length < 6) return;
    const job = this.jobs.shift();
    if (!job) return; // nobody asked for one
    const target = this.members[job.slot];
    if (!target?.conn || from === job.slot) return;
    const { tick, data: world } = decodeSnapshot(data);
    target.conn.send(encodeSnapshot(Bin.SnapshotDeliver, tick, world));
    this.diverged.delete(job.slot);
    if (job.history) for (let t = tick; t < this.history.length; t++) target.conn.send(this.history[t]!);
  }

  /** Produce and broadcast the confirmed inputs for the current tick. Called at the tick rate. */
  /** The host stopped the game: no ticks are produced until it is resumed. */
  paused = false;

  setPaused(on: boolean): void {
    if (!this.started || this.paused === on) return;
    this.paused = on;
    for (const m of this.members) if (m?.conn) send(m.conn, { t: 'paused', on });
  }

  advance(): void {
    if (!this.started || this.paused) return;
    const inputs: (PlayerInput | undefined)[] = [];
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const m = this.members[s];
      if (!m || !m.joined || !m.conn) {
        inputs.push(undefined);
        continue;
      }
      let inp = m.pending.get(this.tick);
      if (inp) {
        m.last = inp;
        m.miss = 0;
      } else {
        m.miss = (m.miss ?? 0) + 1;
        // a short gap repeats the last input (smooth); a long one means the player is gone for now: stand still, keep aim
        inp = m.last && m.miss <= 12 ? { ...m.last } : { ...NO_INPUT, aim: m.last?.aim ?? 0 };
      }
      for (const t of m.pending.keys()) if (t <= this.tick) m.pending.delete(t);
      inputs.push(inp);
    }
    while (inputs.length > 0 && inputs[inputs.length - 1] === undefined) inputs.pop();
    const bundle = encodeBundle({ tick: this.tick, joins: this.pendingJoins, inputs });
    this.pendingJoins = [];
    this.history.push(bundle);
    for (const m of this.members) if (m?.conn) m.conn.send(bundle);
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
    send(conn, { t: 'error', message: `version mismatch: this server runs ${this.opts.version}, your game is ${typeof v === 'string' ? v : 'unknown'}. Reload the page (or update) and try again.` });
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
        const m = room.add(conn, validName(msg.name), weaponOf(msg.weapon), accOf(msg.acc), colorOf(msg.color), clsOf(msg.cls))!;
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
        const m = room.add(conn, validName(msg.name), weaponOf(msg.weapon), accOf(msg.acc), colorOf(msg.color), clsOf(msg.cls));
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
        const m = room && typeof msg.token === 'string' ? room.rejoin(conn, msg.token) : null;
        if (!room || !m) return send(conn, { t: 'error', message: 'cannot rejoin' });
        room.lastActive = this.now;
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'start':
        if (isHost()) a!.room.start();
        break;
      case 'options':
        if (isHost()) a!.room.setOptions({ map: msg.map, difficulty: msg.difficulty });
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
    for (const r of this.rooms.values()) r.advance();
    if (this.now % (TICK_RATE * 15) === 0) {
      for (const [code, r] of this.rooms) {
        if (r.empty && this.now - r.lastActive > this.opts.idleSeconds * TICK_RATE) this.rooms.delete(code);
      }
    }
  }
}
