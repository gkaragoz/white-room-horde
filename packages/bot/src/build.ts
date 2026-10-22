import type { BuildDecision, Ctx, Percept } from './types';

/**
 * Cards, weapons and drones. OWNED BY THE BUILD STRATEGY WORK: this is the baseline (take a card when one is offered; never switch
 * weapon or drone); replace it with a per class strategy (tank, damage, support builds, card priorities by class and by what
 * the team already holds, weapon choice by range and ammo, drone choice, when to swap) without changing the signature.
 */
export function decideBuild(p: Percept, ctx: Ctx): BuildDecision {
  void ctx;
  const card = p.offer.length > 0 && p.tick % 2 === 0 ? (((p.tick % 3) + 1) as 1 | 2 | 3) : 0;
  return { card, wsel: 0, dsel: 0 };
}
