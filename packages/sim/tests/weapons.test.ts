import { BALANCE, Buttons, ENEMY_TYPES, PickupType, PlayerState, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, restoreWorld, serializeWorld, spawnEnemy, step } from '../src';
import { spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const FIRE: PlayerInput = { ...NONE, buttons: Buttons.Fire };
const T = (n: string): number => ENEMY_TYPES.indexOf(n as (typeof ENEMY_TYPES)[number]);

function quiet(seed: number): ReturnType<typeof createWorld> {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  return w;
}

function shotsIn(id: WeaponId, ticks: number): number {
  const w = quiet(5);
  addPlayer(w, 0, 0, 0, id);
  let shots = 0;
  for (let i = 0; i < ticks; i++) {
    step(w, [FIRE]);
    shots += w.events.filter((e) => e.type === 'shot').length;
  }
  return shots;
}

describe('weapons are distinct', () => {
  it('every weapon has complete, sane stats', () => {
    for (const id of WEAPON_IDS) {
      const s = BALANCE.weapons[id];
      expect(s.damage, id).toBeGreaterThan(0);
      expect(s.rate, id).toBeGreaterThan(0);
      expect(s.mag, id).toBeGreaterThan(0);
      expect(s.reload, id).toBeGreaterThan(0);
      expect(s.range, id).toBeGreaterThan(2);
      expect(s.muzzleFwd, id).toBeGreaterThan(0.5);
    }
  });

  it('pistol is calm, the revolver slower and the machine pistol much faster', () => {
    const pistol = shotsIn('pistol', 30);
    expect(pistol).toBeLessThanOrEqual(4);
    expect(shotsIn('revolver', 30)).toBeLessThan(pistol);
    expect(shotsIn('mp', 30)).toBeGreaterThan(pistol * 4);
  });

  it('magazines are limited: the double barrel fires two, then reloads', () => {
    const w = quiet(5);
    addPlayer(w, 0, 0, 0, 'dbl');
    const log: string[] = [];
    for (let i = 0; i < 90; i++) {
      step(w, [FIRE]);
      for (const e of w.events) if (e.type === 'shot' || e.type === 'reloadStart' || e.type === 'reloadDone') log.push(e.type);
    }
    expect(log.slice(0, 4)).toEqual(['shot', 'shot', 'reloadStart', 'reloadDone']);
  });

  it('a revolver round hits harder than a pistol round and goes through one enemy', () => {
    expect(BALANCE.weapons.revolver.damage).toBeGreaterThan(BALANCE.weapons.pistol.damage * 2);
    expect(BALANCE.weapons.revolver.pierce).toBeGreaterThanOrEqual(1);
  });

  it('the double barrel and the flamethrower throw many projectiles per shot', () => {
    for (const id of ['dbl', 'flamer'] as const) {
      const w = quiet(2);
      addPlayer(w, 0, 0, 0, id);
      step(w, [FIRE]);
      expect(w.bActive.reduce((a, b) => a + b, 0), id).toBe(BALANCE.weapons[id].pellets);
    }
  });

  it('the grenade launcher round explodes on the first enemy and hurts the ones around it', () => {
    const w = quiet(3);
    addPlayer(w, 0, -10, 0, 'gl');
    const front = spawnEnemy(w, T('grunt'), -4, 0, false);
    const side = spawnEnemy(w, T('grunt'), -4, 1.2, false);
    const far = spawnEnemy(w, T('grunt'), 4, 0, false);
    for (const e of [front, side, far]) w.eCooldown[e] = 1e9;
    const hp0 = w.eHp[side]!;
    const farHp = w.eHp[far]!;
    let boom = 0;
    for (let t = 0; t < 40; t++) {
      step(w, [t === 0 ? FIRE : NONE]);
      boom += w.events.filter((e) => e.type === 'explosion').length;
    }
    expect(boom).toBe(1);
    expect(w.eHp[side]! < hp0 || !w.eActive[side]).toBe(true);
    expect(w.eHp[far]).toBe(farHp);
  });
});

describe('weapon slots', () => {
  const C1: PlayerInput = { ...NONE, buttons: Buttons.Card1 };
  const C2: PlayerInput = { ...NONE, buttons: Buttons.Card2 };

  it('a player with another weapon also carries a pistol as the sidearm; a pistol player carries none', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'smg');
    addPlayer(w, 1, 2, 0, 'pistol');
    expect(WEAPON_IDS[w.pStashW[0]!]).toBe('pistol');
    expect(w.pStashW[1]).toBe(-1);
  });

  it('keys 1 and 2 pick the main weapon and the sidearm, each keeping its own ammo', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'ar');
    for (let i = 0; i < 20; i++) step(w, [FIRE]);
    const mag = w.pMag[0]!;
    expect(mag).toBeLessThan(BALANCE.weapons.ar.mag);
    step(w, [C2]);
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('pistol');
    expect(w.pSel[0]).toBe(1);
    step(w, [C2]); // pressing the same key again changes nothing
    expect(w.pSel[0]).toBe(1);
    step(w, [C1]);
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('ar');
    expect(w.pMag[0]).toBe(mag);
  });

  it('a dry main weapon falls back to the pistol by itself, and an ammo crate brings the main weapon back', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0, 'dbl');
    w.pMag[0] = 0;
    w.pAmmo[0] = 0;
    let switched = false;
    step(w, [NONE]);
    for (const e of w.events) if (e.type === 'weaponSwitch' && e.auto) switched = true;
    expect(switched).toBe(true);
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('pistol');
    // the pistol keeps shooting
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      step(w, [FIRE]);
      shots += w.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBeGreaterThan(0);
    // an ammo crate on the floor: the main weapon is refilled and taken back
    spawnPickup(w, PickupType.Ammo, w.pX[0]!, w.pY[0]!);
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('dbl');
    expect(w.pAmmo[0]).toBeGreaterThan(0);
  });

  it('a weapon crate replaces the main weapon but keeps the pistol', () => {
    const w = quiet(3);
    addPlayer(w, 0, 0, 0, 'smg');
    step(w, [C2]); // pistol in the hands
    spawnPickup(w, PickupType.Weapon, w.pX[0]!, w.pY[0]!, WEAPON_IDS.indexOf('gl'));
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('gl');
    expect(WEAPON_IDS[w.pStashW[0]!]).toBe('pistol');
  });

  it('survives a snapshot round trip', () => {
    const w = quiet(4);
    addPlayer(w, 0, 0, 0, 'ar');
    step(w, [C2]);
    const copy = createWorld(4);
    restoreWorld(copy, serializeWorld(w));
    expect(copy.pSel[0]).toBe(1);
    expect(WEAPON_IDS[copy.pStashW[0]!]).toBe('ar');
    expect(hashWorld(copy)).toBe(hashWorld(w));
  });
});

describe('reviving', () => {
  function downedPair(): ReturnType<typeof createWorld> {
    const w = quiet(4);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 0.8, 0);
    w.pState[1] = PlayerState.Downed;
    w.pHp[1] = 0;
    w.pTimer[1] = BALANCE.player.downedSeconds;
    return w;
  }
  const REV: PlayerInput = { ...NONE, buttons: Buttons.Revive };

  it('holding the key fills the progress and brings the teammate back', () => {
    const w = downedPair();
    for (let i = 0; i < 30 * (BALANCE.player.reviveSeconds + 1) && w.pState[1] === PlayerState.Downed; i++) step(w, [REV, NONE]);
    expect(w.pState[1]).toBe(PlayerState.Alive);
  });

  it('letting go interrupts: the progress drains and the bleed-out clock keeps running, then a retry works', () => {
    const w = downedPair();
    for (let i = 0; i < 30; i++) step(w, [REV, NONE]);
    const mid = w.pRevive[1]!;
    expect(mid).toBeGreaterThan(0.5);
    const timer = w.pTimer[1]!;
    for (let i = 0; i < 12; i++) step(w, [NONE, NONE]);
    expect(w.pRevive[1]!).toBeLessThan(mid);
    expect(w.pTimer[1]!).toBeLessThan(timer);
    for (let i = 0; i < 30 * (BALANCE.player.reviveSeconds + 1) && w.pState[1] === PlayerState.Downed; i++) step(w, [REV, NONE]);
    expect(w.pState[1]).toBe(PlayerState.Alive);
  });

  it('a helper is slowed and cannot shoot while reviving', () => {
    const w = downedPair();
    const x0 = w.pX[0]!;
    step(w, [{ moveX: -127, moveY: 0, aim: 0, buttons: Buttons.Revive | Buttons.Fire }, NONE]);
    const moved = Math.abs(w.pX[0]! - x0);
    expect(moved).toBeLessThan((BALANCE.player.speed / 30) * 0.8);
    expect(w.events.some((e) => e.type === 'shot')).toBe(false);
  });
});

describe('weapon balance', () => {
  /** Damage per second over a whole magazine including the reload, blast damage included. */
  const sustained = (id: WeaponId): number => {
    const s = BALANCE.weapons[id];
    const shot = s.damage * s.pellets + (s.blastDamage ?? 0);
    return (shot * s.mag) / (s.mag / s.rate + s.reload);
  };

  it('no weapon is hopeless or dominant: sustained damage per second stays in one band', () => {
    const all = WEAPON_IDS.map((id) => [id, sustained(id)] as const);
    for (const [id, dps] of all) {
      expect(dps, id).toBeGreaterThan(38);
      expect(dps, id).toBeLessThan(102);
    }
    const values = all.map(([, v]) => v);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(2.7);
  });

  it('burst damage is capped so the minigun and heavy machine gun do not melt everything', () => {
    for (const id of WEAPON_IDS) {
      const s = BALANCE.weapons[id];
      expect(s.damage * s.pellets * s.rate, id).toBeLessThan(165);
    }
  });

  it('the roles stay different: the sniper outranges everything, the flamethrower is short and the minigun spins up', () => {
    const range = (id: WeaponId): number => BALANCE.weapons[id].range;
    expect(Math.max(...WEAPON_IDS.map(range))).toBe(range('sniper'));
    expect(range('flamer')).toBeLessThan(6);
    expect(BALANCE.weapons.minigun.spinUp ?? 0).toBeGreaterThan(0);
    expect(BALANCE.weapons.shotgun.pellets).toBeGreaterThan(5);
  });
});
