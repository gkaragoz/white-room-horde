import type { CombatDecision, Ctx, Percept } from './types';

/**
 * What to shoot, where to aim, when to reload, throw a grenade or use the class ability. OWNED BY THE MOVEMENT AND COMBAT WORK:
 * this is the baseline (shoot the nearest enemy); replace it with real target choice (threat order, lead the shot with the
 * enemy velocity, weapon ranges and spread, pierce lines, bosses and elites, class abilities by situation) without changing the signature.
 */
export function decideCombat(p: Percept, ctx: Ctx): CombatDecision {
  void ctx;
  const target = p.enemies[0];
  const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
  let crowd = 0;
  for (const e of p.enemies) {
    if (e.d2 >= 100) break;
    crowd++;
  }
  return {
    aim,
    aimDist: 20,
    fire: target !== undefined,
    reload: p.mag === 0 && p.tick % 30 === 0,
    grenade: { throw: crowd > 14 && p.tick % 45 === p.slot * 5, aim },
    special: crowd > 6,
  };
}
