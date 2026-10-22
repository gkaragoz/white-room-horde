import { Buttons, GAME_VERSION, MAX_PLAYERS, type PlayerInput } from '@wrh/shared';
import { hashWorld, scriptedInput } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Bin, NetSession, RoomManager, decodeBundle, encodeBotInputsMsg, decodeBotInputsMsg, encodeInputsMsg, type Conn, type PlayerInfo, type ServerMsg } from '../src';

/** A zero-latency link between a NetSession and the manager, on a clock the test controls. */
class Pair {
  readonly conn: Conn;
  readonly session: NetSession;
  n = 0;
  constructor(
    readonly mgr: RoomManager,
    clock: { now: number },
  ) {
    this.conn = { send: (d) => this.session.onMessage(d) };
    this.session = new NetSession({ send: (d) => mgr.handle(this.conn, d) }, () => clock.now);
  }
  frame(now: number, drive: ((p: Pair) => void) | undefined): void {
    if (now % 33 === 0 && this.session.state === 'playing') {
      this.session.sendInput(scriptedInput(this.n++, this.session.slot));
      if (this.session.drivesBots) drive?.(this);
    }
    this.session.pump();
  }
}

class Net {
  readonly clock = { now: 1000 };
  readonly mgr = new RoomManager({ rate: 1e9 });
  readonly pairs: Pair[] = [];
  /** What the host's page does for its bots on every input tick. */
  drive: ((p: Pair) => void) | undefined;
  add(name: string): Pair {
    const p = new Pair(this.mgr, this.clock);
    this.pairs.push(p);
    if (this.pairs.length === 1) p.session.create(name);
    else p.session.join(this.pairs[0]!.session.code, name);
    return p;
  }
  run(ms: number): void {
    for (let i = 0; i < ms; i++) {
      this.clock.now++;
      if (this.clock.now % 33 === 0) this.mgr.tick();
      for (const p of this.pairs) p.frame(this.clock.now, this.drive);
    }
  }
  get room() {
    return this.mgr.rooms.get(this.pairs[0]!.session.code)!;
  }
}

/** A hand-made connection that records what the relay sends it. */
function raw(): { conn: Conn; got: (string | Uint8Array)[]; json: () => ServerMsg[]; bundles: () => ReturnType<typeof decodeBundle>[] } {
  const got: (string | Uint8Array)[] = [];
  return {
    conn: { send: (d) => got.push(d) },
    got,
    json: () => got.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as ServerMsg),
    bundles: () => got.filter((d): d is Uint8Array => typeof d !== 'string' && d[0] === Bin.Bundle).map((d) => decodeBundle(d, MAX_PLAYERS)),
  };
}

const roomOf = (r: ReturnType<typeof raw>): Extract<ServerMsg, { t: 'room' }> => r.json().filter((m): m is Extract<ServerMsg, { t: 'room' }> => m.t === 'room').pop()!;
const send = (mgr: RoomManager, c: Conn, m: object): void => mgr.handle(c, JSON.stringify(m));
const botsOf = (players: PlayerInfo[]): PlayerInfo[] => players.filter((p) => p.bot);
const input = (moveX: number, buttons = 0): PlayerInput => ({ moveX, moveY: 0, aim: 1000, buttons });

function room(): { mgr: RoomManager; host: ReturnType<typeof raw>; guest: ReturnType<typeof raw>; code: string; roomObj: () => import('../src').Room } {
  const mgr = new RoomManager({ rate: 1e9 });
  const host = raw();
  const guest = raw();
  const v = GAME_VERSION;
  send(mgr, host.conn, { t: 'create', name: 'host', v });
  const code = roomOf(host).code;
  send(mgr, guest.conn, { t: 'join', code, name: 'guest', v });
  return { mgr, host, guest, code, roomObj: () => mgr.rooms.get(code)! };
}

describe('bots in the lobby', () => {
  it('the host sets bots: they take the free slots, are marked, connected, and carry the skill', () => {
    const { mgr, host, guest } = room();
    send(mgr, host.conn, { t: 'bots', list: [[2, 'smg', 'Ada'], [4, 'ar', 'Bolt'], [1, 'shotgun', 'Cinder']], skill: 'superhuman' });
    const r = roomOf(guest);
    const bots = botsOf(r.players);
    expect(bots.map((b) => b.slot)).toEqual([2, 3, 4]);
    expect(bots.map((b) => b.name)).toEqual(['Ada', 'Bolt', 'Cinder']);
    expect(bots.every((b) => b.connected && !b.host)).toBe(true);
    expect(bots.map((b) => b.cls)).toEqual([2, 4, 1]);
    expect(r.botSkill).toBe('superhuman');
    expect(r.players.filter((p) => !p.bot)).toHaveLength(2);
  });

  it('setting bots again replaces them; an empty list removes them', () => {
    const { mgr, host, guest } = room();
    send(mgr, host.conn, { t: 'bots', list: [[0, 'pistol', 'A'], [0, 'pistol', 'B']], skill: 'easy' });
    send(mgr, host.conn, { t: 'bots', list: [[1, 'smg', 'C']], skill: 'normal' });
    expect(botsOf(roomOf(guest).players).map((b) => b.name)).toEqual(['C']);
    send(mgr, host.conn, { t: 'bots', list: [], skill: 'normal' });
    expect(botsOf(roomOf(guest).players)).toHaveLength(0);
  });

  it('only the host may set bots', () => {
    const { mgr, guest, host } = room();
    send(mgr, guest.conn, { t: 'bots', list: [[0, 'pistol', 'X']], skill: 'easy' });
    expect(botsOf(roomOf(host).players)).toHaveLength(0);
  });

  it('never more bots than free slots, and names, classes and weapons are sanitized', () => {
    const { mgr, host } = room();
    const list = Array.from({ length: 11 }, (_, i) => [i === 0 ? 999 : 1, i === 1 ? 'laser-doom' : 'smg', i === 2 ? '<b>' + 'x'.repeat(40) : 'n' + i]);
    send(mgr, host.conn, { t: 'bots', list, skill: 'godlike' });
    const r = roomOf(host);
    const bots = botsOf(r.players);
    expect(bots).toHaveLength(MAX_PLAYERS - 2);
    expect(bots[0]!.cls).toBe(0);
    expect(bots[1]!.weapon).toBe('pistol');
    expect(bots[2]!.name).not.toMatch(/[<>]/);
    expect(bots[2]!.name.length).toBeLessThanOrEqual(16);
    expect(r.botSkill).toBe('expert'); // an unknown skill falls back to the default
  });

  it('garbage entries are ignored', () => {
    const { mgr, host } = room();
    send(mgr, host.conn, { t: 'bots', list: [7, null, 'x', [1, 'smg', 'ok']], skill: 'easy' });
    expect(botsOf(roomOf(host).players).map((b) => b.name)).toEqual(['ok']);
    send(mgr, host.conn, { t: 'bots', list: 'nope', skill: 'easy' });
    expect(botsOf(roomOf(host).players)).toHaveLength(1);
  });

  it('a person joining a full lobby takes the place of the last bot', () => {
    const { mgr, host, code } = room();
    send(mgr, host.conn, { t: 'bots', list: Array.from({ length: 9 }, (_, i) => [0, 'pistol', 'b' + i]), skill: 'easy' });
    expect(botsOf(roomOf(host).players)).toHaveLength(9);
    const late = raw();
    const v = GAME_VERSION;
    send(mgr, late.conn, { t: 'join', code, name: 'late', v });
    expect(late.json().some((m) => m.t === 'error')).toBe(false);
    const r = roomOf(host);
    expect(r.players).toHaveLength(MAX_PLAYERS);
    expect(botsOf(r.players)).toHaveLength(8);
    expect(r.players.find((p) => p.name === 'late')!.slot).toBe(MAX_PLAYERS - 1);
  });

  it('when the host leaves the lobby the role goes to a person, never to a bot; with nobody left the room goes', () => {
    const { mgr, host, guest, code } = room();
    send(mgr, host.conn, { t: 'bots', list: [[0, 'pistol', 'b']], skill: 'easy' });
    mgr.close(host.conn, true);
    const r = roomOf(guest);
    expect(r.players.find((p) => p.name === 'guest')!.host).toBe(true);
    expect(r.players.find((p) => p.bot)!.host).toBe(false);
    mgr.close(guest.conn, true);
    expect(mgr.rooms.has(code)).toBe(false);
  });

  it('bots cannot be set once the game runs', () => {
    const { mgr, host } = room();
    send(mgr, host.conn, { t: 'start' });
    send(mgr, host.conn, { t: 'bots', list: [[0, 'pistol', 'b']], skill: 'easy' });
    expect(botsOf(roomOf(host).players)).toHaveLength(0);
  });

  it('the start message lists the bots as players', () => {
    const { mgr, host } = room();
    send(mgr, host.conn, { t: 'bots', list: [[3, 'ar', 'Ada']], skill: 'easy' });
    send(mgr, host.conn, { t: 'start' });
    const start = host.json().find((m): m is Extract<ServerMsg, { t: 'start' }> => m.t === 'start')!;
    expect(start.players.map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(start.players[2]).toMatchObject({ cls: 3, weapon: 'ar' });
  });
});

describe('bot inputs in a running game', () => {
  function running() {
    const r = room();
    send(r.mgr, r.host.conn, { t: 'bots', list: [[0, 'pistol', 'A'], [0, 'pistol', 'B']], skill: 'normal' });
    send(r.mgr, r.host.conn, { t: 'start' });
    return r;
  }
  const bundleAt = (r: ReturnType<typeof raw>, tick: number) => r.bundles().find((b) => b.tick === tick)!;

  it("the host's bot input is applied at its tick, cleaned like any input (clamped, no Away flag)", () => {
    const { mgr, host, guest } = running();
    mgr.tick(); // tick 0
    mgr.handle(host.conn, encodeBotInputsMsg(3, [{ slot: 2, input: input(100) }, { slot: 3, input: input(-90, Buttons.Away | Buttons.Fire) }]));
    for (let i = 0; i < 4; i++) mgr.tick();
    const b = bundleAt(guest, 3);
    expect(b.inputs[2]!.moveX).toBe(100);
    expect(b.inputs[3]!.moveX).toBe(-90);
    expect(b.inputs[3]!.buttons & Buttons.Away).toBe(0);
    expect(b.inputs[3]!.buttons & Buttons.Fire).toBe(Buttons.Fire);
  });

  it('only the host is believed, only for bot slots, and only inside the window', () => {
    const { mgr, host, guest, roomObj } = running();
    mgr.tick();
    mgr.handle(guest.conn, encodeBotInputsMsg(2, [{ slot: 2, input: input(77) }]));
    mgr.handle(host.conn, encodeBotInputsMsg(2, [{ slot: 1, input: input(88) }, { slot: 0, input: input(66) }, { slot: 9, input: input(55) }, { slot: 200, input: input(44) }]));
    mgr.handle(host.conn, encodeBotInputsMsg(0, [{ slot: 2, input: input(33) }])); // too late
    mgr.handle(host.conn, encodeBotInputsMsg(100000, [{ slot: 2, input: input(22) }])); // absurdly early
    for (let i = 0; i < 4; i++) mgr.tick();
    const b = bundleAt(guest, 2);
    expect(b.inputs[2]!.moveX).toBe(0);
    expect(b.inputs[1]!.moveX).not.toBe(88); // the guest's own slot is driven by the guest only
    expect(b.inputs[0]!.moveX).not.toBe(66);
    expect(roomObj().members[2]!.pending.size).toBe(0);
  });

  it('malformed bot messages are dropped', () => {
    const { mgr, host } = running();
    const good = encodeBotInputsMsg(5, [{ slot: 2, input: input(1) }]);
    expect(decodeBotInputsMsg(good)?.list[0]?.slot).toBe(2);
    expect(decodeBotInputsMsg(good.subarray(0, good.length - 1))).toBeNull();
    const zero = new Uint8Array(6);
    zero[0] = Bin.BotInputs;
    expect(decodeBotInputsMsg(zero)).toBeNull();
    mgr.handle(host.conn, good.subarray(0, good.length - 1)); // must not throw
  });

  it('a bot that nobody drives repeats its input for a moment, then idles under the Away protection; it stays in the room', () => {
    const { mgr, host, guest, roomObj } = running();
    mgr.tick();
    mgr.handle(host.conn, encodeBotInputsMsg(1, [{ slot: 2, input: input(100, Buttons.Fire) }]));
    for (let i = 0; i < 30; i++) mgr.tick();
    expect(bundleAt(guest, 5).inputs[2]!.moveX).toBe(100); // repeated
    const late = bundleAt(guest, 29).inputs[2]!;
    expect(late.buttons & Buttons.Away).toBe(Buttons.Away);
    expect(late.moveX).toBe(0);
    expect(roomObj().members[2]?.bot).toBe(true);
    expect(bundleAt(guest, 29).inputs[3]).toBeDefined();
  });

  it('bots survive the host dropping; the new host (a person) is the one the relay listens to', () => {
    const { mgr, host, guest, roomObj } = running();
    for (let i = 0; i < 5; i++) mgr.tick();
    mgr.close(host.conn); // a dropped connection, not a final leave
    expect(roomObj().members[0]!.host).toBe(false);
    expect(roomObj().members[1]!.host).toBe(true);
    expect(botsOf(roomObj().members.filter((m) => m).map((m) => ({ ...m! })) as unknown as PlayerInfo[]).length).toBe(2);
    const t = roomObj().tick;
    // the old host's connection is gone; a stale message from it is not accepted either
    mgr.handle(host.conn, encodeBotInputsMsg(t + 2, [{ slot: 2, input: input(11) }]));
    mgr.handle(guest.conn, encodeBotInputsMsg(t + 2, [{ slot: 2, input: input(22) }]));
    for (let i = 0; i < 4; i++) mgr.tick();
    expect(bundleAt(guest, t + 2).inputs[2]!.moveX).toBe(22);
    // the bots are in the bundles for the whole game
    expect(bundleAt(guest, t + 3).inputs[3]).toBeDefined();
  });

  it('a returning host gets the role back and the bots are still there', () => {
    const { mgr, host, guest, roomObj, code } = running();
    for (let i = 0; i < 5; i++) mgr.tick();
    const token = roomOf(host).token;
    mgr.close(host.conn);
    for (let i = 0; i < 40; i++) mgr.tick();
    const back = raw();
    const v = GAME_VERSION;
    send(mgr, back.conn, { t: 'rejoin', code, token, v });
    const r = roomOf(back);
    expect(r.players.find((p) => p.slot === 0)!.host).toBe(true);
    expect(botsOf(r.players)).toHaveLength(2);
    expect(back.json().some((m) => m.t === 'start')).toBe(true);
    expect(roomObj().members[1]!.host).toBe(false);
    void guest;
  });

  it('a late joiner is given the bots in the room and every bundle, bot inputs included', () => {
    const { mgr, host, code } = running();
    for (let i = 0; i < 3; i++) mgr.tick();
    mgr.handle(host.conn, encodeBotInputsMsg(5, [{ slot: 3, input: input(99) }]));
    for (let i = 0; i < 8; i++) mgr.tick();
    const late = raw();
    const v = GAME_VERSION;
    send(mgr, late.conn, { t: 'join', code, name: 'late', v });
    for (let i = 0; i < 3; i++) mgr.tick();
    const r = roomOf(late);
    expect(r.slot).toBe(4);
    expect(botsOf(r.players).map((b) => b.slot)).toEqual([2, 3]);
    const start = late.json().find((m): m is Extract<ServerMsg, { t: 'start' }> => m.t === 'start')!;
    expect(start.players.map((p) => p.slot)).toEqual([0, 1, 2, 3]); // the world starts with the bots in it; the late joiner arrives with a join command
    const bundles = late.bundles();
    expect(bundles[0]!.tick).toBe(0);
    expect(bundles.find((b) => b.tick === 5)!.inputs[3]!.moveX).toBe(99);
  });

  it('a late joiner on a long game gets a snapshot from a person, never asked of a bot', () => {
    const mgr = new RoomManager({ rate: 1e9, catchUpLimit: 10 });
    const v = GAME_VERSION;
    const host = raw();
    send(mgr, host.conn, { t: 'create', name: 'host', v });
    const code = roomOf(host).code;
    send(mgr, host.conn, { t: 'bots', list: [[0, 'pistol', 'A']], skill: 'easy' });
    send(mgr, host.conn, { t: 'start' });
    for (let i = 0; i < 30; i++) mgr.tick();
    const late = raw();
    send(mgr, late.conn, { t: 'join', code, name: 'late', v });
    expect(host.json().filter((m) => m.t === 'snapshotRequest')).toHaveLength(1);
    // the host (the only person) answers with a tiny stand-in snapshot: the relay forwards it to the joiner
    const snap = new Uint8Array(6 + 20);
    snap[0] = Bin.Snapshot;
    new DataView(snap.buffer).setUint32(1, 20, true);
    mgr.handle(host.conn, snap);
    expect(late.got.some((d) => typeof d !== 'string' && d[0] === Bin.SnapshotDeliver)).toBe(true);
  });

  it('a hash vote needs only the people: bots never hold a game up', () => {
    const { mgr, host, guest } = running();
    for (let i = 0; i < 3; i++) mgr.tick();
    mgr.handle(host.conn, JSON.stringify({ t: 'hash', tick: 30, hash: 5 }));
    mgr.handle(guest.conn, JSON.stringify({ t: 'hash', tick: 30, hash: 5 }));
    expect(host.json().some((m) => m.t === 'desync')).toBe(false);
  });
});

describe('end to end: the host drives bots, every page sees the same game', () => {
  it('two pages with three bots stay in lockstep (same world hash) and the bots really move', () => {
    const net = new Net();
    const host = net.add('host');
    const guest = net.add('guest');
    net.run(100);
    host.session.setBots([[2, 'smg', 'Ada'], [3, 'ar', 'Bolt'], [5, 'pistol', 'Cinder']], 'normal');
    expect(host.session.botSlots).toEqual([2, 3, 4]);
    expect(guest.session.botSlots).toEqual([2, 3, 4]);
    expect(guest.session.botSkill).toBe('normal');
    host.session.start();
    let ticks = 0;
    net.drive = (p) => {
      ticks++;
      // a simple deterministic "brain": each bot walks in its own direction
      p.session.sendBotInputs(p.session.botSlots.map((slot, i) => ({ slot, input: { moveX: 100, moveY: (i - 1) * 50, aim: 100 * i, buttons: Buttons.Fire } })));
    };
    net.run(8000);
    expect(host.session.state).toBe('playing');
    expect(host.session.drivesBots).toBe(true);
    expect(guest.session.drivesBots).toBe(false);
    expect(ticks).toBeGreaterThan(100);
    const hw = host.session.world!;
    const gw = guest.session.world!;
    // both pages stepped the same number of ticks only if they are at the same tick: compare at the lower one by also pumping fully
    while (host.session.applied < guest.session.applied) host.session.pump();
    while (guest.session.applied < host.session.applied) guest.session.pump();
    expect(hashWorld(hw)).toBe(hashWorld(gw));
    expect(hw.pActive[2]).toBe(1);
    expect(hw.pActive[4]).toBe(1);
    // the bots walked (they did not just stand at the spawn)
    expect(Math.hypot(hw.pX[2]!, hw.pY[2]!)).toBeGreaterThan(0.5);
    expect(net.room.members[3]?.bot).toBe(true);
  });

  it('encodeInputsMsg of a person is untouched by the bot message type', () => {
    const buf = encodeInputsMsg(5, [input(1)]);
    expect(buf[0]).toBe(Bin.Inputs);
    expect(Bin.BotInputs).not.toBe(Bin.Inputs);
  });
});
