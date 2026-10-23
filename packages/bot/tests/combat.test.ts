import { CLASS_IDS, WEAPON_IDS } from '@wrh/shared';
import { createGame, spawnEnemy, type World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { decideCombat } from '../src/combat';
import { perceive } from '../src/perception';
import { profileOf } from '../src/skill';
import type { CombatDecision, Ctx, Skill } from '../src/types';

const cls = (name: (typeof CLASS_IDS)[number]): number => CLASS_IDS.indexOf(name);

function game(className: (typeof CLASS_IDS)[number] = 'soldier', weapon: 'smg' | 'pistol' | 'shotgun' = 'smg'): World {
  const w = createGame({ seed: 5, players: [{ slot: 0, weapon, cls: cls(className) }] });
  w.misc[1] = 0;
  w.pX[0] = 0;
  w.pY[0] = 0;
  return w;
}

const ctxOf = (skill: Skill = 'superhuman'): Ctx => ({ skill: profileOf(skill), rand: () => 0.5, mem: {} });
const decide = (w: World, ctx = ctxOf()): CombatDecision => decideCombat(perceive(w, 0, ctx.mem), ctx);
const grunt = (w: World, x: number, y: number): number => spawnEnemy(w, 0, x, y, false);
const angleTo = (x: number, y: number): number => Math.atan2(y, x);

describe('combat: guns', () => {
  it('fires at what is in range and aims at it', () => {
    const w = game();
    grunt(w, 10, -5);
    const d = decide(w);
    expect(d.fire).toBe(true);
    expect(Math.abs(d.aim - angleTo(10, -5))).toBeLessThan(0.1);
  });

  it('holds fire when everything is out of range', () => {
    const w = game();
    grunt(w, 45, 0);
    expect(decide(w).fire).toBe(false);
  });

  it('reloads in a lull but never with a target in reach', () => {
    const w = game();
    w.pMag[0] = 10;
    expect(decide(w).reload).toBe(true);
    grunt(w, 8, 0);
    expect(decide(w).reload).toBe(false);
  });

  it('leads a moving target', () => {
    const w = game();
    const id = grunt(w, 16, 0);
    const ctx = ctxOf();
    perceive(w, 0, ctx.mem);
    // the second look sees it moved up by half a unit
    w.eY[id] = 0.5;
    const d = decide(w, ctx);
    expect(d.aim).toBeGreaterThan(angleTo(16, 0.5));
  });
});

describe('combat: grenades and abilities', () => {
  it('throws a grenade into a thick crowd, aiming at the crowd', () => {
    const w = game();
    for (let i = 0; i < 10; i++) grunt(w, 9 + (i % 3) * 0.8, 1 + (i % 4) * 0.7);
    const d = decide(w);
    expect(d.grenade.throw).toBe(true);
    expect(Math.abs(d.grenade.aim - angleTo(10, 2))).toBeLessThan(0.4);
    expect(d.aimDist).toBeGreaterThan(5);
    expect(d.aimDist).toBeLessThan(14);
  });

  it('keeps its grenades for a lone walker', () => {
    const w = game();
    grunt(w, 9, 0);
    expect(decide(w).grenade.throw).toBe(false);
    w.pGren[0] = 0;
    for (let i = 0; i < 10; i++) grunt(w, 9 + (i % 3) * 0.8, 1 + (i % 4) * 0.7);
    expect(decide(w).grenade.throw).toBe(false);
  });

  it('uses the class ability on a crowd and not while it recharges', () => {
    const w = game('soldier');
    for (let i = 0; i < 8; i++) grunt(w, 7 + (i % 3), -2 + i * 0.6);
    expect(decide(w).special).toBe(true);
    w.pSpecCd[0] = 5;
    expect(decide(w).special).toBe(false);
  });

  it('heals with the medic when hurt and in a fight', () => {
    const w = game('medic');
    grunt(w, 6, 0);
    expect(decide(w).special).toBe(false);
    w.pHp[0] = w.pMaxHp[0]! * 0.4;
    expect(decide(w).special).toBe(true);
  });

  it('calls the airstrike on the crowd with half the distance on the wire', () => {
    const w = game('demolisher');
    for (let i = 0; i < 10; i++) grunt(w, 10 + (i % 3) * 0.8, 1 + (i % 4) * 0.7);
    const d = decide(w);
    expect(d.special).toBe(true);
    expect(d.aimDist).toBeGreaterThan(4);
    expect(d.aimDist).toBeLessThan(8);
  });
});

describe('combat: blades and hammers', () => {
  it('swings the sword at the busy side', () => {
    const w = game('swordsman');
    expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('sword');
    grunt(w, -2, 1);
    grunt(w, -2.2, -0.5);
    grunt(w, -1.5, 0.3);
    const d = decide(w);
    expect(d.fire).toBe(true);
    // all three stand inside the arc of the swing (143 degrees)
    for (const [x, y] of [[-2, 1], [-2.2, -0.5], [-1.5, 0.3]] as const) {
      let da = angleTo(x, y) - d.aim;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      expect(Math.abs(da)).toBeLessThan(1.45);
    }
  });

  it('does not swing at air', () => {
    const w = game('swordsman');
    grunt(w, 15, 0);
    expect(decide(w).fire).toBe(false);
  });

  it('lets the hammer go when it is fully charged', () => {
    const w = game('hammerer');
    grunt(w, 2, 0);
    grunt(w, 2.5, 1);
    expect(decide(w).fire).toBe(true);
    w.pCharge[0] = 1.1;
    expect(decide(w).fire).toBe(false);
  });
});
