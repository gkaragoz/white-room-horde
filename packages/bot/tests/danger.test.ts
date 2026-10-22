import { BALANCE, ENEMY_TYPES, TeleEffect } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { ELITE_ID, PRIORITY, RADIUS, SPEED, T, bursts, lateScale, radiusOf, speedOf, telePain } from '../src/danger';
import type { Telegraph, Threat } from '../src/types';

const threat = (over: Partial<Threat>): Threat => ({ id: 0, x: 0, y: 0, d2: 0, type: T.grunt, boss: false, elite: 0, hp: 10, maxHp: 10, vx: 0, vy: 0, layer: 0, ...over });
const tele = (over: Partial<Telegraph>): Telegraph => ({ x: 0, y: 0, shape: 0, w: 2, l: 0, eta: 10, effect: TeleEffect.Hurt, angle: 0, amt: 10, ...over });

describe('danger tables', () => {
  it('know every enemy type', () => {
    for (const id of ENEMY_TYPES) {
      const i = ENEMY_TYPES.indexOf(id);
      expect(SPEED[i]).toBe(BALANCE.enemies[id].speed);
      expect(RADIUS[i]).toBe(BALANCE.enemies[id].radius);
      expect(PRIORITY[i]).toBeGreaterThan(0);
    }
  });

  it('put the fragile bombs first in the kill order and the shielder last', () => {
    expect(PRIORITY[T.exploder]).toBeGreaterThan(PRIORITY[T.grunt]!);
    expect(PRIORITY[T.shielder]).toBeLessThan(PRIORITY[T.grunt]!);
  });

  it('scale speed and size with elites and bosses', () => {
    expect(speedOf(threat({ elite: ELITE_ID.Swift }))).toBeGreaterThan(speedOf(threat({})));
    expect(speedOf(threat({ elite: ELITE_ID.Giant }))).toBeLessThan(speedOf(threat({})));
    expect(radiusOf(threat({ elite: ELITE_ID.Giant }))).toBeGreaterThan(radiusOf(threat({})));
    expect(radiusOf(threat({ boss: true }))).toBeGreaterThan(radiusOf(threat({})));
  });

  it('know which ones burst', () => {
    expect(bursts(threat({ type: T.exploder }))).toBe(true);
    expect(bursts(threat({ elite: ELITE_ID.Volatile }))).toBe(true);
    expect(bursts(threat({}))).toBe(false);
  });

  it('let the late floors hit harder', () => {
    expect(lateScale(1)).toBe(1);
    expect(lateScale(BALANCE.late.start + 10)).toBeCloseTo(1 + 10 * BALANCE.late.damagePerFloor, 9);
  });
});

describe('telegraph pain', () => {
  it('counts flat damage in tens of hit points and boss shares of the max health', () => {
    expect(telePain(tele({ amt: 20 }), 100, 100, 1)).toBeCloseTo((20 * BALANCE.enemyDamageMul) / 10, 9);
    expect(telePain(tele({ amt: -0.4 }), 100, 100, 1)).toBeCloseTo(4, 9);
    expect(telePain(tele({ amt: -3 }), 100, 100, 1)).toBeCloseTo(9.5, 9);
  });

  it('makes a kill zone worse than half and half worse than a warning', () => {
    const kill = telePain(tele({ effect: TeleEffect.Kill }), 100, 80, 1);
    const half = telePain(tele({ effect: TeleEffect.Half }), 100, 80, 1);
    const none = telePain(tele({ effect: TeleEffect.None }), 100, 80, 1);
    expect(kill).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(none);
    expect(telePain(tele({ effect: TeleEffect.Strike }), 100, 80, 1)).toBe(0);
  });
});
