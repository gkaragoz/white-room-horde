import type { BuildDecision, Ctx, Percept } from './types';

/** The first, naive build logic (kept for comparisons in eval-build): take a card when one is offered, by the tick; never switch weapon or drone. */
export function baselineBuild(p: Percept, ctx: Ctx): BuildDecision {
  void ctx;
  const card = p.offer.length > 0 && p.tick % 2 === 0 ? (((p.tick % 3) + 1) as 1 | 2 | 3) : 0;
  return { card, wsel: 0, dsel: 0 };
}
