import { BALANCE, Buttons, decodeTick, encodeTick, ENEMY_TYPES, PickupType, PlayerState, WEAPON_IDS, WEAPON_RANK, type PlayerInput, type WeaponId } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, restoreWorld, serializeWorld, spawnEnemy, step } from '../src';
import { giveWeapon, owns, usable } from '../src/loadout';
import { pickWeapon, spawnPickup } from '../src/pickups';

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
      if (s.melee) {
        // blades and hammers swing instead of shooting
        expect(s.melee.arc, id).toBeGreaterThan(1);
        expect(s.melee.radius, id).toBeGreaterThan(2);
        continue;
      }
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

describe('weapon inventory', () => {
  const key = (rank: number): PlayerInput => ({ ...NONE, wsel: rank });
  const NEXT = key(14);
  const idx = (id: (typeof WEAPON_IDS)[number]): number => WEAPON_IDS.indexOf(id);
  const rankOf = (id: (typeof WEAPON_IDS)[number]): number => WEAPON_RANK.indexOf(id) + 1;
  const hands = (w: ReturnType<typeof quiet>): string => WEAPON_IDS[w.pWeapon[0]!]!;

  it('the ranking is a permutation of the weapons, weakest first', () => {
    expect([...WEAPON_RANK].sort()).toEqual([...WEAPON_IDS].sort());
    expect(WEAPON_RANK[0]).toBe('pistol');
    expect(WEAPON_RANK[WEAPON_RANK.length - 3]).toBe('minigun'); // the two melee weapons come last
    expect(WEAPON_RANK.slice(-2)).toEqual(['sword', 'hammer']);
  });

  it('a player starts with the chosen weapon and a pistol; a pistol player owns only the pistol', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'smg');
    addPlayer(w, 1, 2, 0, 'pistol');
    expect(owns(w, 0, idx('smg'))).toBe(true);
    expect(owns(w, 0, idx('pistol'))).toBe(true);
    expect(owns(w, 0, idx('ar'))).toBe(false);
    expect(owns(w, 1, idx('smg'))).toBe(false);
  });

  it('a number key picks the weapon of that rank and each weapon keeps its own ammo', () => {
    const w = quiet(1);
    addPlayer(w, 0, 0, 0, 'ar');
    for (let i = 0; i < 20; i++) step(w, [FIRE]);
    const mag = w.pMag[0]!;
    expect(mag).toBeLessThan(BALANCE.weapons.ar.mag);
    step(w, [key(rankOf('pistol'))]);
    expect(hands(w)).toBe('pistol');
    step(w, [key(rankOf('pistol'))]); // the same key again changes nothing
    expect(hands(w)).toBe('pistol');
    step(w, [key(rankOf('ar'))]);
    expect(hands(w)).toBe('ar');
    expect(w.pMag[0]).toBe(mag);
    // a weapon the player does not own cannot be picked
    step(w, [key(rankOf('smg'))]);
    expect(hands(w)).toBe('ar');
  });

  it('Q walks up the owned weapons, skips empty ones and wraps around', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0, 'pistol');
    for (const id of ['mp', 'ar', 'minigun'] as const) giveWeapon(w, 0, idx(id));
    const seen: string[] = [hands(w)];
    for (let i = 0; i < 5; i++) {
      step(w, [NEXT]);
      seen.push(hands(w));
    }
    expect(seen).toEqual(['pistol', 'mp', 'ar', 'minigun', 'pistol', 'mp']);
    // an empty weapon is skipped
    step(w, [key(rankOf('pistol'))]);
    w.pInvMag[idx('mp')] = 0;
    w.pInvAmmo[idx('mp')] = 0;
    step(w, [NEXT]);
    expect(hands(w)).toBe('ar');
    // and cannot be chosen by its number
    step(w, [key(rankOf('mp'))]);
    expect(hands(w)).toBe('ar');
  });

  it('a weapon that runs dry is replaced by the nearest usable one, one rank lower first', () => {
    const w = quiet(3);
    addPlayer(w, 0, 0, 0, 'ar');
    for (const id of ['smg', 'dbl'] as const) giveWeapon(w, 0, idx(id));
    // ar (rank 7) runs dry: smg (rank 6) is one lower
    w.pMag[0] = 0;
    w.pAmmo[0] = 0;
    let auto = false;
    step(w, [NONE]);
    for (const e of w.events) if (e.type === 'weaponSwitch' && e.auto) auto = true;
    expect(auto).toBe(true);
    expect(hands(w)).toBe('smg');
    // the smg goes dry too: dbl (rank 5) is nearer than the pistol or ar
    w.pMag[0] = 0;
    w.pAmmo[0] = 0;
    step(w, [NONE]);
    expect(hands(w)).toBe('dbl');
    // nothing but the pistol is left usable at the end: the dry weapons never stay in the hands
    w.pMag[0] = 0;
    w.pAmmo[0] = 0;
    step(w, [NONE]);
    expect(hands(w)).toBe('pistol');
    expect(usable(w, 0, w.pWeapon[0]!)).toBe(true);
    // the pistol keeps shooting
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      step(w, [FIRE]);
      shots += w.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBeGreaterThan(0);
  });

  it('an ammo crate refills every weapon of the inventory, the ones in the hands and the ones in the bag', () => {
    const w = quiet(4);
    addPlayer(w, 0, 0, 0, 'ar');
    for (const id of ['smg', 'sniper'] as const) giveWeapon(w, 0, idx(id));
    w.pMag[0] = 1;
    w.pAmmo[0] = 3;
    w.pInvMag[idx('smg')] = 0;
    w.pInvAmmo[idx('smg')] = 0;
    w.pInvAmmo[idx('sniper')] = 2;
    spawnPickup(w, PickupType.Ammo, w.pX[0]!, w.pY[0]!);
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(w.pMag[0]).toBe(BALANCE.weapons.ar.mag);
    expect(w.pAmmo[0]).toBe(BALANCE.weapons.ar.ammo);
    expect(w.pInvMag[idx('smg')]).toBe(BALANCE.weapons.smg.mag);
    expect(w.pInvAmmo[idx('smg')]).toBe(BALANCE.weapons.smg.ammo);
    expect(w.pInvAmmo[idx('sniper')]).toBe(BALANCE.weapons.sniper.ammo);
  });

  it('a weapon crate adds the weapon for good without taking it into the hands; a second one refills it', () => {
    const w = quiet(5);
    addPlayer(w, 0, 0, 0, 'smg');
    spawnPickup(w, PickupType.Weapon, w.pX[0]!, w.pY[0]!, idx('gl'));
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(hands(w)).toBe('smg');
    expect(owns(w, 0, idx('gl'))).toBe(true);
    expect(w.events.length).toBeGreaterThanOrEqual(0);
    w.pInvMag[idx('gl')] = 0;
    w.pInvAmmo[idx('gl')] = 0;
    spawnPickup(w, PickupType.Weapon, w.pX[0]!, w.pY[0]!, idx('gl'));
    for (let i = 0; i < 10; i++) step(w, [NONE]);
    expect(w.pInvAmmo[idx('gl')]).toBe(BALANCE.weapons.gl.ammo);
    // and it stays in the inventory through everything: floors, deaths of other weapons
    step(w, [key(rankOf('gl'))]);
    expect(hands(w)).toBe('gl');
  });

  it('weapon drops prefer weapons the squad is still missing', () => {
    const w = quiet(6);
    addPlayer(w, 0, 0, 0, 'pistol');
    for (const id of WEAPON_IDS) if (id !== 'minigun') giveWeapon(w, 0, idx(id));
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(pickWeapon(w));
    expect([...seen]).toEqual([idx('minigun')]);
    giveWeapon(w, 0, idx('minigun'));
    const any = new Set<number>();
    for (let i = 0; i < 200; i++) any.add(pickWeapon(w)); // nothing is missing any more: any weapon may drop
    expect(any.size).toBeGreaterThan(5);
  });

  it('survives a snapshot round trip', () => {
    const w = quiet(4);
    addPlayer(w, 0, 0, 0, 'ar');
    giveWeapon(w, 0, idx('sniper'));
    step(w, [key(rankOf('pistol'))]);
    const copy = createWorld(4);
    restoreWorld(copy, serializeWorld(w));
    expect(copy.pOwned[0]).toBe(w.pOwned[0]);
    expect(WEAPON_IDS[copy.pWeapon[0]!]).toBe('pistol');
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
    const all = WEAPON_IDS.filter((id) => !BALANCE.weapons[id].melee).map((id) => [id, sustained(id)] as const);
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
      if (s.melee) continue;
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

describe('thrown grenades', () => {
  it('a grenade lands where the cursor was: the distance travels with the input and is limited to the throwing range', () => {
    const land = (aimDist: number | undefined): number => {
      const w = quiet(31);
      addPlayer(w, 0, -20, 0);
      w.pGren[0] = 3;
      step(w, [{ ...NONE, buttons: Buttons.Grenade, aimDist }]);
      for (let i = 0; i < 40; i++) step(w, [NONE]);
      // the grenade stops moving when its fuse starts: read where it ended up
      return w.gActive.indexOf(1) >= 0 ? w.gX[w.gActive.indexOf(1)]! + 20 : NaN;
    };
    expect(land(40)).toBeCloseTo(10, 1); // 40 quarter units = 10 units away
    expect(land(8)).toBeCloseTo(2, 1);
    expect(land(255)).toBeCloseTo(BALANCE.grenade.maxRange, 1); // far cursor: the longest throw
    expect(land(undefined)).toBeCloseTo(BALANCE.grenade.range, 1); // no cursor (gamepad): the normal throw
  });

  it('the aim distance survives the wire format', () => {
    const buf = encodeTick([{ moveX: 1, moveY: -2, aim: 1234, buttons: 3, aimDist: 77 }]);
    expect(decodeTick(buf, 1).inputs[0]!.aimDist).toBe(77);
  });
});

describe('explosive rounds', () => {
  it('a rocket bursts on the first enemy even with piercing upgrades', () => {
    const w = quiet(32);
    addPlayer(w, 0, -10, 0, 'gl');
    w.modPierce[0] = 3;
    const a = spawnEnemy(w, T('grunt'), -4, 0, false);
    const b = spawnEnemy(w, T('grunt'), 3, 0, false);
    for (const e of [a, b]) w.eCooldown[e] = 1e9;
    const x: number[] = [];
    for (let i = 0; i < 40; i++) {
      step(w, [i === 0 ? FIRE : NONE]);
      for (const ev of w.events) if (ev.type === 'explosion') x.push(ev.x);
    }
    expect(x.length).toBe(1);
    expect(x[0]!).toBeLessThan(0); // at the first enemy, not beyond it
  });
});
