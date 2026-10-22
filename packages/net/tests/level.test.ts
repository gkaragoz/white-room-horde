import { DRONE_TYPES, GAME_VERSION, MAX_LEVEL, MODS, WEAPON_IDS, poolAt } from '@wrh/shared';
import { scriptedInput } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { NetSession, RoomManager, type Conn } from '../src';

type Msg = { t: string; [k: string]: unknown };

/** A hand-made connection that records what the relay sends it. */
function raw(mgr: RoomManager) {
  const got: (string | Uint8Array)[] = [];
  const conn: Conn = { send: (d) => got.push(d) };
  const json = () => got.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as Msg);
  return {
    conn,
    json,
    send: (m: object) => mgr.handle(conn, JSON.stringify(m)),
    last: (t: string) => json().filter((m) => m.t === t).pop(),
  };
}

function room(opts: { host?: object; guest?: object; options?: { map: number; mods: number } } = {}) {
  const mgr = new RoomManager({ rate: 1e9 });
  const host = raw(mgr);
  const guest = raw(mgr);
  host.send({ t: 'create', name: 'host', v: GAME_VERSION, ...opts.host });
  const code = host.last('room')!.code as string;
  guest.send({ t: 'join', code, name: 'guest', v: GAME_VERSION, ...opts.guest });
  if (opts.options) host.send({ t: 'options', ...opts.options });
  return { mgr, host, guest, code };
}

describe('the room level', () => {
  it('is the lowest level in the room, and every player sees it', () => {
    const { host, guest } = room({ host: { lvl: 40 }, guest: { lvl: 7 } });
    expect(host.last('room')!.players).toMatchObject([{ lvl: 40 }, { lvl: 7 }]);
    host.send({ t: 'start' });
    expect(host.last('start')!.level).toBe(7);
    expect(guest.last('start')!.level).toBe(7);
  });

  it('is the full game for a player who says nothing, or something invalid', () => {
    for (const bad of [undefined, 0, -3, 101, 3.5, 'x', null]) {
      const { host } = room({ host: { lvl: bad }, guest: { lvl: bad } });
      host.send({ t: 'start' });
      expect(host.last('start')!.level, String(bad)).toBe(MAX_LEVEL);
    }
  });

  it('carries what each player had met, limited to real weapons and drones', () => {
    const { host } = room({ host: { lvl: 5, metW: 0b101, metD: 0b11 }, guest: { lvl: 9, metW: 0xffffffff, metD: 0xffff } });
    host.send({ t: 'start' });
    const players = host.last('start')!.players as { slot: number; metWeapons: number; metDrones: number }[];
    expect(players[0]).toMatchObject({ metWeapons: 0b101, metDrones: 0b11 });
    expect(players[1]).toMatchObject({ metWeapons: (1 << WEAPON_IDS.length) - 1, metDrones: (1 << DRONE_TYPES.length) - 1 });
  });

  it('limits the arena and the difficulty multipliers to what that level opened', () => {
    const closedArena = 5; // not open at level 1
    const allMods = (1 << MODS.length) - 1;
    const { host } = room({ host: { lvl: 1 }, guest: { lvl: 100 }, options: { map: closedArena, mods: allMods } });
    host.send({ t: 'start' });
    const start = host.last('start')!;
    const pool = poolAt(1);
    expect(pool.arenas & (1 << closedArena)).toBe(0);
    expect(pool.arenas & (1 << (start.map as number))).not.toBe(0);
    expect(start.mods).toBe(allMods & pool.mods);
  });

  it('leaves the full game untouched at level 100', () => {
    const allMods = (1 << MODS.length) - 1;
    const { host } = room({ options: { map: 5, mods: allMods } });
    host.send({ t: 'start' });
    expect(host.last('start')).toMatchObject({ level: MAX_LEVEL, map: 5, mods: allMods });
  });

  it('is not lowered by somebody joining a running game', () => {
    const { mgr, host, code } = room({ host: { lvl: 40 }, guest: { lvl: 40 } });
    host.send({ t: 'start' });
    const late = raw(mgr);
    late.send({ t: 'join', code, name: 'late', v: GAME_VERSION, lvl: 2, metW: 1, metD: 0 });
    expect(late.last('start')!.level).toBe(40);
  });
});

describe('a game at the room level', () => {
  it('runs every player at the lowest level, with equal worlds', () => {
    const mgr = new RoomManager({ rate: 1e9 });
    const clock = { now: 1000 };
    const sessions = ['a', 'b'].map((name) => {
      const link: { session?: NetSession } = {};
      const conn: Conn = { send: (d) => link.session!.onMessage(d) };
      const self = new NetSession({ send: (d) => mgr.handle(conn, d) }, () => clock.now);
      link.session = self;
      return { name, self };
    });
    sessions[0]!.self.create('a', 'pistol', { lvl: 30 });
    sessions[1]!.self.join(sessions[0]!.self.code, 'b', 'pistol', { lvl: 6, metW: 0b11 });
    sessions[0]!.self.start();
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      clock.now++;
      if (clock.now % 33 === 0) {
        mgr.tick();
        n++;
        for (const s of sessions) if (s.self.state === 'playing') s.self.sendInput(scriptedInput(n, s.self.slot));
      }
      for (const s of sessions) s.self.pump();
    }
    const [a, b] = sessions.map((s) => s.self.world!);
    expect(a!.tick).toBeGreaterThan(60);
    expect(a!.metLevel).toBe(6);
    expect(b!.metLevel).toBe(6);
    expect(a!.pMetWeapons[1]).toBe(0b11);
    for (const s of sessions) expect(s.self.desyncTicks).toEqual([]);
  });
});
