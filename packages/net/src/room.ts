import { MAX_PLAYERS, NO_INPUT, WEAPON_IDS, clampInput, type PlayerInput, type WeaponId } from '@wrh/shared';
import { Bin, decodeInputMsg, decodeSnapshot, encodeBundle, encodeSnapshot, type ClientMsg, type PlayerInfo, type ServerMsg } from './protocol';

/** Anything the server can write to: a WebSocket in production, a fake in tests. */
export interface Conn {
  send(data: string | Uint8Array): void;
}

interface Member {
  slot: number;
  name: string;
  host: boolean;
  conn: Conn | null;
  weapon: WeaponId;
  /** Set once the member is part of the running simulation (join command emitted). */
  joined: boolean;
  /** Input tagged by target tick, and the last one that was applied. */
  pending: Map<number, PlayerInput>;
  last: PlayerInput | undefined;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Room {
  readonly members: (Member | null)[] = new Array<Member | null>(MAX_PLAYERS).fill(null);
  started = false;
  tick = 0;
  seed = 0;
  /** Every bundle sent so far, for late joiners. */
  readonly history: Uint8Array[] = [];
  private pendingJoins: { slot: number; weaponIndex: number }[] = [];
  private readonly votes = new Map<number, Map<number, number>>();
  private readonly diverged = new Set<number>();
  private snapshotFor = -1;

  constructor(readonly code: string) {}

  private info(): PlayerInfo[] {
    const out: PlayerInfo[] = [];
    for (const m of this.members) if (m) out.push({ slot: m.slot, name: m.name, host: m.host, connected: m.conn !== null });
    return out;
  }

  broadcastRoom(): void {
    for (const m of this.members) {
      if (m?.conn) send(m.conn, { t: 'room', code: this.code, slot: m.slot, players: this.info(), started: this.started });
    }
  }

  add(conn: Conn, name: string, weapon: WeaponId): Member | null {
    const slot = this.members.findIndex((m) => m === null);
    if (slot < 0) return null;
    const host = this.members.every((m) => m === null);
    const m: Member = { slot, name: name.slice(0, 16) || 'player', host, conn, weapon, joined: false, pending: new Map(), last: undefined };
    this.members[slot] = m;
    if (this.started) {
      // late join: tell the client how the game started, replay the history, then add the player at the next tick
      this.pendingJoins.push({ slot, weaponIndex: WEAPON_IDS.indexOf(weapon) });
      m.joined = true;
      send(conn, { t: 'start', seed: this.seed, players: this.startPlayers });
      for (const b of this.history) conn.send(b);
    }
    return m;
  }

  private startPlayers: { slot: number; weapon: WeaponId }[] = [];

  start(): void {
    if (this.started) return;
    this.started = true;
    this.seed = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
    this.startPlayers = [];
    for (const m of this.members) {
      if (!m) continue;
      m.joined = true;
      this.startPlayers.push({ slot: m.slot, weapon: m.weapon });
    }
    for (const m of this.members) if (m?.conn) send(m.conn, { t: 'start', seed: this.seed, players: this.startPlayers });
    this.broadcastRoom();
  }

  disconnect(slot: number): void {
    const m = this.members[slot];
    if (!m) return;
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
    if (!m || tick < this.tick) return; // too late: dropped, the previous input stays in force
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
    for (const m of this.members) {
      if (m?.conn && m.joined && m.slot !== slot && !this.diverged.has(m.slot)) {
        this.snapshotFor = slot;
        send(m.conn, { t: 'snapshotRequest' });
        return;
      }
    }
  }

  snapshot(from: number, data: Uint8Array): void {
    const target = this.members[this.snapshotFor];
    if (!target?.conn || from === this.snapshotFor) return;
    const t = decodeSnapshot(data).tick;
    target.conn.send(encodeSnapshot(Bin.SnapshotDeliver, t, decodeSnapshot(data).data));
    this.diverged.delete(this.snapshotFor);
    this.snapshotFor = -1;
  }

  /** Produce and broadcast the confirmed inputs for the current tick. Called at the tick rate. */
  advance(): void {
    if (!this.started) return;
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
      } else {
        inp = m.last ? { ...m.last } : { ...NO_INPUT };
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

/** Room registry and message router. Transport agnostic: the Node server and the tests both drive it. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly attached = new Map<Conn, Attached>();

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  handle(conn: Conn, data: string | Uint8Array): void {
    if (typeof data !== 'string') {
      const a = this.attached.get(conn);
      if (a && data[0] === Bin.Input && data.length >= 10) {
        const { tick, input } = decodeInputMsg(data);
        a.room.input(a.slot, tick, input);
      } else if (a && data[0] === Bin.Snapshot) {
        a.room.snapshot(a.slot, data);
      }
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data) as ClientMsg;
    } catch {
      return;
    }
    const a = this.attached.get(conn);
    const weaponOf = (w?: WeaponId): WeaponId => (w && WEAPON_IDS.includes(w) ? w : 'pistol');
    switch (msg.t) {
      case 'create': {
        if (a) return;
        const room = new Room(this.newCode());
        this.rooms.set(room.code, room);
        const m = room.add(conn, msg.name, weaponOf(msg.weapon))!;
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'join': {
        if (a) return;
        const room = this.rooms.get(String(msg.code).toUpperCase());
        if (!room) return send(conn, { t: 'error', message: 'room not found' });
        const m = room.add(conn, msg.name, weaponOf(msg.weapon));
        if (!m) return send(conn, { t: 'error', message: 'room is full' });
        this.attached.set(conn, { room, slot: m.slot });
        room.broadcastRoom();
        break;
      }
      case 'start':
        if (a && a.room.members[a.slot]?.host) a.room.start();
        break;
      case 'hash':
        if (a) a.room.hash(a.slot, msg.tick, msg.hash);
        break;
      case 'ping':
        send(conn, { t: 'pong', ts: msg.ts });
        break;
      case 'resync':
        if (a) a.room.resync(a.slot);
        break;
      case 'leave':
        this.close(conn);
        break;
    }
  }

  close(conn: Conn): void {
    const a = this.attached.get(conn);
    if (!a) return;
    this.attached.delete(conn);
    a.room.disconnect(a.slot);
    if (a.room.empty) this.rooms.delete(a.room.code);
  }

  /** Advance every running room by one tick. */
  tick(): void {
    for (const r of this.rooms.values()) r.advance();
  }
}
