import { PlayerState } from '@wrh/shared';
import { baselineBuild } from './build-baseline';
import { pickCard, scoreOffer } from './cardscore';
import { chooseDrone } from './drones';
import { classOf } from './perception';
import { buildMode } from './strategy/mode';
import { readSheet } from './strategy/sheet';
import type { BuildDecision, Ctx, Percept } from './types';
import { chooseWeapon } from './weapons';

export { buildMode } from './strategy/mode';

interface BuildMem {
  /** The offer the pick below belongs to (card indices joined), and the position chosen. */
  key: string;
  pick: number;
  /** Did the last decision hold a card button? A card button must go up before it can be pressed again. */
  pressed: boolean;
  /** The tick the weapon and drone were last looked at, and what they decided. */
  at: number;
  wsel: number;
  dsel: number;
}

const memOf = (ctx: Ctx): BuildMem => {
  let m = ctx.mem.buildState as BuildMem | undefined;
  if (!m) {
    m = { key: '', pick: -1, pressed: false, at: -1e9, wsel: 0, dsel: 0 };
    ctx.mem.buildState = m;
  }
  return m;
};

/**
 * Cards, weapons and drones. Cards are scored for this class and what the character already holds (cardscore.ts), the best is taken
 * (judgement adds mistakes at lower skills), and the button is pressed fresh: up on one decision, down on the next, never while
 * no offer is open. The weapon (weapons.ts) and drone (drones.ts) follow the fight.
 */
export function decideBuild(p: Percept, ctx: Ctx): BuildDecision {
  if (buildMode.baseline) return baselineBuild(p, ctx);
  const m = memOf(ctx);
  let card: 0 | 1 | 2 | 3 = 0;
  if (p.offer.length === 0 || p.state !== PlayerState.Alive) {
    m.pressed = false;
    m.key = '';
  } else {
    const key = p.offer.join(',');
    if (key !== m.key) {
      m.key = key;
      const cls = classOf(p.world, p.slot);
      m.pick = buildMode.noCards ? Math.min(p.offer.length - 1, Math.floor(ctx.rand() * p.offer.length)) : pickCard(scoreOffer(p.world, p.slot, cls, p.offer), ctx.skill.judgement, ctx.rand);
    }
    if (m.pressed) {
      m.pressed = false;
    } else if (m.pick >= 0 && m.pick < p.offer.length) {
      card = (m.pick + 1) as 1 | 2 | 3;
      m.pressed = true;
    }
  }
  if (p.tick - m.at >= 4) {
    m.at = p.tick;
    const sheet = readSheet(p.world, p.slot);
    const cls = classOf(p.world, p.slot);
    m.wsel = p.state === PlayerState.Alive && !buildMode.noWeapons ? chooseWeapon(p, ctx.mem, sheet, ctx.skill.judgement, ctx.rand, cls) : 0;
    m.dsel = buildMode.noDrones ? 0 : chooseDrone(p, ctx.mem, sheet, ctx.skill.judgement, ctx.rand);
  }
  return { card, wsel: m.wsel, dsel: m.dsel };
}
