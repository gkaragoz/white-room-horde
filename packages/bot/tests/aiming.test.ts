import { BALANCE, WEAPON_IDS } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { chooseShot, leadAngle } from '../src/aiming';
import { T } from '../src/danger';
import { profileOf } from '../src/skill';
import type { Ctx, Percept, Threat } from '../src/types';
import { profileOfWeapon } from '../src/weapons';

const SMG = WEAPON_IDS.indexOf('smg');
const SHOTGUN = WEAPON_IDS.indexOf('shotgun');

function enemy(id: number, x: number, y: number, over: Partial<Threat> = {}): Threat {
  return { id, x, y, d2: x * x + y * y, type: T.grunt, boss: false, elite: 0, hp: 30, maxHp: 30, vx: 0, vy: 0, layer: 0, ...over };
}

function percept(enemies: Threat[], weapon = SMG, x = 0, y = 0): Percept {
  const list = [...enemies].sort((a, b) => a.d2 - b.d2);
  return { tick: 0, wave: 1, slot: 0, x, y, angle: 0, hp: 100, maxHp: 100, state: 0, layer: 0, mag: 30, weapon, enemies: list, telegraphs: [], zones: [], spits: [], pickups: [], allies: [], offer: [], phase: 0, grenades: 0, world: { map: 0 } as unknown as World };
}

const ctx = (skill: 'expert' | 'easy' = 'expert'): Ctx => ({ skill: profileOf(skill), rand: () => 0.5, mem: {} });

/** Fly a bullet from the muzzle at `angle` and report how close it passes the target that walks at (vx, vy) units per second. */
function miss(p: Percept, angle: number, e: Threat, speed: number): number {
  const st = BALANCE.weapons[WEAPON_IDS[p.weapon]!]!;
  const mx = p.x + Math.cos(angle) * st.muzzleFwd + Math.sin(angle) * st.muzzleSide;
  const my = p.y + Math.sin(angle) * st.muzzleFwd - Math.cos(angle) * st.muzzleSide;
  let best = 1e9;
  for (let t = 0; t < 2; t += 1 / 600) {
    const bx = mx + Math.cos(angle) * speed * t;
    const by = my + Math.sin(angle) * speed * t;
    const tx = e.x + e.vx * 30 * t;
    const ty = e.y + e.vy * 30 * t;
    best = Math.min(best, Math.hypot(bx - tx, by - ty));
  }
  return best;
}

describe('aiming: lead', () => {
  it('sends the bullet through a target that is crossing', () => {
    const e = enemy(1, 18, 4, { vx: 0, vy: 6 / 30 });
    const p = percept([e]);
    const prof = profileOfWeapon(SMG);
    const lead = leadAngle(p, e, prof, 1);
    expect(miss(p, lead, e, prof.speed)).toBeLessThan(0.15);
    // aiming at the target where it stands misses by far more
    const flat = Math.atan2(e.y, e.x);
    expect(miss(p, flat, e, prof.speed)).toBeGreaterThan(1);
  });

  it('takes the muzzle offset into account for a standing target', () => {
    const e = enemy(1, 15, 0);
    const p = percept([e]);
    const prof = profileOfWeapon(SMG);
    expect(miss(p, leadAngle(p, e, prof, 1), e, prof.speed)).toBeLessThan(0.05);
  });

  it('leads less when the shooter judges badly', () => {
    const e = enemy(1, 18, 4, { vx: 0, vy: 6 / 30 });
    const p = percept([e]);
    const prof = profileOfWeapon(SMG);
    expect(miss(p, leadAngle(p, e, prof, 0.3), e, prof.speed)).toBeGreaterThan(miss(p, leadAngle(p, e, prof, 1), e, prof.speed));
  });
});

describe('aiming: target choice', () => {
  it('shoots the bomb before the grunt that stands a little closer', () => {
    const p = percept([enemy(1, 6, 0), enemy(2, 8, 2, { type: T.exploder, hp: 15, maxHp: 15 })]);
    const s = chooseShot(p, ctx(), profileOfWeapon(SMG));
    expect(p.enemies[s.index]!.id).toBe(2);
    expect(s.clear).toBe(true);
  });

  it('does not shoot what is out of range or behind cover', () => {
    // the warehouse shelf at (30, 9) is 18 wide: an enemy right behind it cannot be hit from below
    const p = percept([enemy(1, 30, 14), enemy(2, 60, 0)], SMG, 30, 3);
    const s = chooseShot(p, ctx(), profileOfWeapon(SMG));
    expect(s.index).toBe(-1);
    expect(s.clear).toBe(false);
  });

  it('prefers a spot where a shotgun blast takes several enemies along', () => {
    const lone = enemy(1, 5, 9);
    const crowd = [enemy(2, 10, 0), enemy(3, 10.5, 0.8), enemy(4, 11, -0.8), enemy(5, 11.5, 0.2)];
    const p = percept([lone, ...crowd], SHOTGUN);
    const s = chooseShot(p, ctx(), profileOfWeapon(SHOTGUN));
    expect(p.enemies[s.index]!.id).not.toBe(1);
  });

  it('keeps its target unless another is clearly better', () => {
    const c = ctx();
    const a = enemy(1, 8, 0);
    const b = enemy(2, 7.6, 3);
    const first = chooseShot(percept([a]), c, profileOfWeapon(SMG));
    expect(first.index).toBe(0);
    const p = percept([a, b]);
    const s = chooseShot(p, c, profileOfWeapon(SMG));
    expect(p.enemies[s.index]!.id).toBe(1);
  });
});
