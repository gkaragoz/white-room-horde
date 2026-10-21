import { BALANCE, Buttons, CLASS_IDS, ENEMY_TYPES, PERK, PickupType, PlayerState, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '../src';
import { launchPlayer } from '../src/hazards';
import { owns } from '../src/loadout';
import { dropLoot, spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const SPECIAL: PlayerInput = { ...NONE, buttons: Buttons.Special };
const FIRE: PlayerInput = { ...NONE, buttons: Buttons.Fire };
const cid = (name: string): number => CLASS_IDS.indexOf(name as (typeof CLASS_IDS)[number]);
const GRUNT = ENEMY_TYPES.indexOf('grunt');

function arena(cls: number, seed = 1, players = 1): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0, 'pistol', cls);
  for (let s = 1; s < players; s++) addPlayer(w, s, s * 2, 0, 'pistol', 0);
  for (let s = 0; s < players; s++) w.pHp[s] = w.pMaxHp[s] = 100;
  return w;
}

const run = (w: World, ticks: number, ...inputs: PlayerInput[]): void => {
  for (let t = 0; t < ticks; t++) step(w, inputs.length ? inputs : [NONE]);
};

function still(w: World, name: string, x: number, y: number): number {
  const e = spawnEnemy(w, ENEMY_TYPES.indexOf(name as (typeof ENEMY_TYPES)[number]), x, y, false);
  w.eCooldown[e] = 1e9;
  w.eFrost[e] = 1e6; // stands where it is
  return e;
}

describe('classes', () => {
  it('there are nine, every one with stats and an ability, and the two melee classes are the last', () => {
    expect(CLASS_IDS.length).toBe(9);
    expect(BALANCE.classes.length).toBe(9);
    for (const id of CLASS_IDS) expect(BALANCE.abilities[id], id).toBeTruthy();
    expect(CLASS_IDS.slice(-2)).toEqual(['swordsman', 'hammerer']);
  });

  it('the ability has a cooldown, an event, and works again after the cooldown', () => {
    for (const id of CLASS_IDS) {
      const w = arena(cid(id));
      let used = 0;
      for (let t = 0; t < 30 * (BALANCE.abilities[id]!.cd! + 3); t++) {
        step(w, [SPECIAL]);
        used += w.events.filter((e) => e.type === 'ability').length;
      }
      expect(used, id).toBeGreaterThanOrEqual(2);
      expect(used, id).toBeLessThanOrEqual(3);
    }
  }, 60_000);
});

describe('abilities', () => {
  it('soldier: the rally speeds up the squad nearby, not a far-off friend', () => {
    const w = arena(cid('soldier'), 2, 2);
    addPlayer(w, 2, 25, 0, 'pistol', 0);
    w.pHp[2] = w.pMaxHp[2] = 100;
    step(w, [SPECIAL, NONE, NONE]);
    expect(w.pRally[0]).toBeGreaterThan(5);
    expect(w.pRally[1]).toBeGreaterThan(5);
    expect(w.pRally[2]).toBe(0);
    const x0 = w.pX[1]!;
    run(w, 30, NONE, { ...NONE, moveX: 127 }, NONE);
    const rallied = w.pX[1]! - x0;
    const w2 = arena(cid('soldier'), 2, 2);
    const y0 = w2.pX[1]!;
    run(w2, 30, NONE, { ...NONE, moveX: 127 });
    expect(rallied).toBeGreaterThan((w2.pX[1]! - y0) * 1.08);
  });

  it('medic: the pulse heals everybody around, up to their maximum', () => {
    const w = arena(cid('medic'), 3, 2);
    w.pHp[0] = 20;
    w.pHp[1] = 90;
    step(w, [SPECIAL, NONE]);
    expect(w.pHp[0]).toBeGreaterThan(20 + w.pMaxHp[0]! * 0.3);
    expect(w.pHp[1]).toBe(w.pMaxHp[1]);
  });

  it('heavy: fortified it takes a third of the damage, moves slower and cannot be thrown', () => {
    const w = arena(cid('heavy'), 4);
    const hurt = (fort: boolean): number => {
      const v = arena(cid('heavy'), 4);
      if (fort) step(v, [SPECIAL]);
      const before = v.pHp[0]!;
      const e = spawnEnemy(v, GRUNT, 0.8, 0, false);
      v.eCooldown[e] = 0;
      run(v, 40);
      return before - v.pHp[0]!;
    };
    expect(hurt(true)).toBeLessThan(hurt(false) * 0.6);
    step(w, [SPECIAL]);
    launchPlayer(w, 0, 10, 0, 1);
    expect(w.pStun[0]).toBe(0);
  });

  it('scout: the burst is much faster and resets the dash', () => {
    const w = arena(cid('scout'), 5);
    w.pDashCd[0] = 5;
    step(w, [SPECIAL]);
    expect(w.pDashCd[0]).toBe(0);
    const x0 = w.pX[0]!;
    run(w, 30, { ...NONE, moveX: 127 });
    const v = arena(cid('scout'), 5);
    const y0 = v.pX[0]!;
    run(v, 30, { ...NONE, moveX: 127 });
    expect(w.pX[0]! - x0).toBeGreaterThan((v.pX[0]! - y0) * 1.3);
  });

  it('demolisher: an airstrike marks circles that land on the enemies there and never hurt the squad', () => {
    const w = arena(cid('demolisher'), 6, 2);
    w.pX[1] = 0;
    w.pY[1] = 3; // a teammate within the strike area
    const e = still(w, 'tank', 12, 0);
    const hp = w.eHp[e]!;
    let telegraphs = 0;
    for (let t = 0; t < 120; t++) {
      step(w, [t === 0 ? { ...SPECIAL, aim: 0 } : NONE, NONE]);
      telegraphs += w.events.filter((x) => x.type === 'telegraph').length;
    }
    expect(telegraphs).toBe(BALANCE.abilities.demolisher!.count);
    expect(w.eHp[e]!).toBeLessThan(hp);
    expect(w.pHp[1]).toBe(w.pMaxHp[1]);
  });

  it('ranger: the overcharge gives the next shots extra piercing and damage, then it is over', () => {
    const w = arena(cid('ranger'), 7);
    step(w, [SPECIAL]);
    expect(w.pOver[0]).toBe(BALANCE.abilities.ranger!.shots);
    step(w, [FIRE]);
    const b = w.bActive.indexOf(1);
    expect(w.bPierce[b]).toBeGreaterThanOrEqual(BALANCE.abilities.ranger!.pierce!);
    const w0 = arena(cid('ranger'), 7);
    step(w0, [FIRE]);
    expect(w.bDamage[b]!).toBeCloseTo(w0.bDamage[w0.bActive.indexOf(1)]! * BALANCE.abilities.ranger!.damage!, 5);
    run(w, 60, FIRE);
    expect(w.pOver[0]).toBe(0);
  });

  it('berserker: the rampage hits harder and cannot be stunned', () => {
    const w = arena(cid('berserker'), 8);
    step(w, [SPECIAL]);
    step(w, [FIRE]);
    const w0 = arena(cid('berserker'), 8);
    step(w0, [FIRE]);
    expect(w.bDamage[w.bActive.indexOf(1)]!).toBeGreaterThan(w0.bDamage[w0.bActive.indexOf(1)]! * 1.4);
    launchPlayer(w, 0, 10, 0, 1);
    expect(w.pStun[0]).toBe(0);
  });
});

describe('melee classes', () => {
  it('own only their weapon and carry no guns', () => {
    for (const [name, weapon] of [['swordsman', 'sword'], ['hammerer', 'hammer']] as const) {
      const w = arena(cid(name), 9);
      expect(WEAPON_IDS[w.pWeapon[0]!]).toBe(weapon);
      expect(owns(w, 0, WEAPON_IDS.indexOf('pistol'))).toBe(false);
      expect(owns(w, 0, WEAPON_IDS.indexOf(weapon))).toBe(true);
    }
  });

  it('gun crates stay on the floor for a blade: it cannot take them, so the others can', () => {
    const w = arena(cid('swordsman'), 10);
    w.pHp[0] = 40;
    w.pGren[0] = 0;
    spawnPickup(w, PickupType.Weapon, w.pX[0]!, w.pY[0]!, WEAPON_IDS.indexOf('ar'));
    run(w, 10);
    expect(w.pHp[0]).toBeLessThan(60);
    expect(owns(w, 0, WEAPON_IDS.indexOf('ar'))).toBe(false);
    expect(w.kActive.reduce((n, a) => n + a, 0)).toBe(1);
  });

  it('a squad of blades alone never drops guns or bullets', () => {
    const w = arena(cid('hammerer'), 14);
    for (let i = 0; i < 400; i++) dropLoot(w, 5, 5, false);
    for (let k = 0; k < w.kActive.length; k++) {
      if (!w.kActive[k]) continue;
      expect(w.kType[k]).not.toBe(PickupType.Weapon);
      expect(w.kType[k]).not.toBe(PickupType.Ammo);
    }
  });

  it('the blade and the hammer set barrels off', () => {
    for (const name of ['swordsman', 'hammerer']) {
      const w = arena(cid(name), 15);
      const b = 0;
      w.brActive[b] = 1;
      w.brHp[b] = BALANCE.barrels.hp;
      w.brX[b] = w.pX[0]! + 1.4;
      w.brY[b] = w.pY[0]!;
      let boom = false;
      for (let t = 0; t < 60 && !boom; t++) {
        step(w, [t < 15 || name === 'swordsman' ? FIRE : NONE]); // the hammer is charged, then let go
        boom = w.events.some((e) => e.type === 'explosion');
      }
      expect(boom, name).toBe(true);
      expect(w.brActive[b]).toBe(0);
    }
  });

  it('they are the sturdiest classes: more regeneration and less damage taken than any gun class', () => {
    for (const name of ['swordsman', 'hammerer']) {
      const c = BALANCE.classes.find((x) => x.id === name)!;
      for (const o of BALANCE.classes) {
        if (o.id === 'swordsman' || o.id === 'hammerer') continue;
        expect(c.regen, name).toBeGreaterThan(o.regen);
        expect(c.armor, name).toBeLessThan(o.armor);
      }
    }
  });

  it('the sword hits what is in front of it inside its arc and reach, and nothing behind or far away', () => {
    const w = arena(cid('swordsman'), 11);
    w.pAngle[0] = 0;
    const front = still(w, 'tank', 2.4, 0);
    const behind = still(w, 'tank', -2.4, 0);
    const far = still(w, 'tank', 7, 0);
    const hp = [front, behind, far].map((e) => w.eHp[e]!);
    let swings = 0;
    let hits = 0;
    for (let t = 0; t < 30; t++) {
      step(w, [FIRE]);
      for (const e of w.events) if (e.type === 'swing') {
        swings++;
        hits += e.hits;
      }
    }
    expect(w.eHp[front]!).toBeLessThan(hp[0]!);
    expect(w.eHp[behind]).toBe(hp[1]);
    expect(w.eHp[far]).toBe(hp[2]);
    expect(swings).toBeGreaterThanOrEqual(2);
    expect(swings).toBeLessThanOrEqual(Math.ceil(BALANCE.weapons.sword.rate * 1.0) + 1);
    expect(hits).toBeGreaterThanOrEqual(2); // (the blows push the tank back, so the last swing may miss)
  });

  it('a swing hits the whole crowd in the arc at once and credits the kills to the swordsman', () => {
    const w = arena(cid('swordsman'), 12);
    const es: number[] = [];
    for (let k = 0; k < 8; k++) {
      const e = still(w, 'grunt', 1.6 + (k % 2) * 0.5, -1.2 + k * 0.35);
      w.eHp[e] = 5;
      es.push(e);
    }
    step(w, [FIRE]);
    expect(es.filter((e) => !w.eActive[e]).length).toBeGreaterThanOrEqual(6);
    expect(w.pPerk[PERK.Kills]).toBeGreaterThanOrEqual(6);
  });

  it('the hammer charges while the trigger is held (and slows the character), then spins all the way round harder than a tap', () => {
    const tap = arena(cid('hammerer'), 13);
    tap.pAngle[0] = 0;
    const a = still(tap, 'tank', 2.6, 0);
    const behindT = still(tap, 'tank', -2.6, 0);
    run(tap, 3, FIRE);
    run(tap, 3, NONE);
    const tapDamage = tap.eHp[a]!;
    expect(tap.eHp[behindT]).toBe(tap.eHp[behindT]); // untouched below
    const full = arena(cid('hammerer'), 13);
    const b = still(full, 'tank', 2.6, 0);
    const behind = still(full, 'tank', -2.6, 0);
    const hp0 = full.eHp[b]!;
    let spun = false;
    run(full, 40, FIRE);
    expect(full.pCharge[0]).toBeGreaterThan(1);
    expect(full.eHp[b]).toBe(hp0); // nothing yet: it is only charging
    for (let t = 0; t < 4; t++) {
      step(full, [NONE]);
      for (const e of full.events) if (e.type === 'swing' && e.arc > 6) spun = true;
    }
    expect(spun).toBe(true);
    expect(full.eHp[behind]!).toBeLessThan(full.eHp[behind]! + 1); // (behind is inside the full circle)
    expect(hp0 - full.eHp[b]!).toBeGreaterThan((hp0 - tapDamage) * 2);
    expect(full.pCharge[0]).toBe(0);
  });

  it('charging slows the hammer fighter down', () => {
    const run1 = (hold: boolean): number => {
      const w = arena(cid('hammerer'), 14);
      const x0 = w.pX[0]!;
      run(w, 20, { ...NONE, moveX: 127, buttons: hold ? Buttons.Fire : 0 });
      return w.pX[0]! - x0;
    };
    expect(run1(true)).toBeLessThan(run1(false) * 0.7);
  });

  it('the hammerer ability slams the ground around it', () => {
    const w = arena(cid('hammerer'), 15);
    const near = still(w, 'tank', 4, 0);
    const far = still(w, 'tank', 12, 0);
    const hp = [w.eHp[near]!, w.eHp[far]!];
    step(w, [SPECIAL]);
    expect(w.eHp[near]!).toBeLessThan(hp[0]!);
    expect(w.eHp[far]).toBe(hp[1]);
  });

  it('the swordsman blade storm keeps hitting everything around for its seconds', () => {
    const w = arena(cid('swordsman'), 16);
    const e = still(w, 'tank', -3, 2);
    step(w, [SPECIAL]);
    let storms = 0;
    for (let t = 0; t < 60; t++) {
      step(w, [NONE]);
      storms += w.events.filter((x) => x.type === 'swing').length;
    }
    expect(storms).toBeGreaterThan(5);
    expect(w.eHp[e]!).toBeLessThan(BALANCE.enemies.tank.hp * w.hpMul);
    expect(w.pState[0]).toBe(PlayerState.Alive);
  });
});
