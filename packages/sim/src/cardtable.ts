import { CARD_STATS, CLASS_CARDS, PERK, PlayerState, UNIVERSAL_CARDS } from '@wrh/shared';
import { addPerk, setPerk, perk } from './features';
import type { World } from './state';

const TABLE = new Map<string, readonly (readonly [string, number])[]>(
  [...UNIVERSAL_CARDS, ...CLASS_CARDS].map((c) => [c.id, c.ops]),
);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The stats that have a rule of their own (CARD_STATS marks them `special`). */
function applySpecial(w: World, stat: string, v: number, by: number): void {
  switch (stat) {
    case 'hp': {
      const next = Math.max(30, w.pMaxHp[by]! + v);
      const delta = next - w.pMaxHp[by]!;
      w.pMaxHp[by] = next;
      if (w.pState[by] === PlayerState.Alive) w.pHp[by] = clamp(w.pHp[by]! + delta, 1, next);
      break;
    }
    case 'heal':
      if (w.pState[by] === PlayerState.Alive)
        w.pHp[by] = Math.min(w.pMaxHp[by]!, w.pHp[by]! + w.pMaxHp[by]! * v);
      break;
    case 'loot':
      w.modLoot = Math.min(3, w.modLoot * v);
      break;
    case 'regen':
      addPerk(w, by, PERK.Regen, v);
      break;
    case 'thorns':
      addPerk(w, by, PERK.Thorns, v);
      break;
    case 'shield':
      addPerk(w, by, PERK.ShieldMax, v);
      setPerk(w, by, PERK.Shield, Math.min(perk(w, by, PERK.ShieldMax), perk(w, by, PERK.Shield) + v));
      break;
    default:
      break;
  }
}

/** The stat changes of one card (tools/cards/*.py list them, CARD_STATS says what each stat does). Returns false for an id that is not in the table. */
export function applyUniversal(w: World, id: string, by: number): boolean {
  const ops = TABLE.get(id);
  if (!ops) return false;
  for (const [stat, v] of ops) {
    const def = CARD_STATS[stat];
    if (!def) continue;
    if (def.apply.kind === 'special') {
      applySpecial(w, stat, v, by);
      continue;
    }
    const { kind, field, min, max } = def.apply;
    const pool = (w as unknown as Record<string, Float64Array | Int32Array>)[field]!;
    let next = kind === 'add' ? pool[by]! + v : pool[by]! * v;
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    pool[by] = next;
  }
  return true;
}
