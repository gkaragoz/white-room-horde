import { CLASS_IDS, PERK, PERKS, PlayerState } from '@wrh/shared';
import type { Percept } from './types';

/** What a class does for the squad. Tanks pull and hold the front, ranged classes stay back, the medic stays near the hurt, the demolisher keeps clear of friends. */
export type Role = 'tank' | 'ranged' | 'medic' | 'demo';

const ROLE_OF_CLASS: Readonly<Record<string, Role>> = {
  heavy: 'tank',
  berserker: 'tank',
  swordsman: 'tank',
  hammerer: 'tank',
  soldier: 'ranged',
  scout: 'ranged',
  ranger: 'ranged',
  medic: 'medic',
  demolisher: 'demo',
};

/** The role of a class (CLASS_IDS index). */
export const roleOfClass = (cls: number): Role => ROLE_OF_CLASS[CLASS_IDS[cls] ?? 'soldier'] ?? 'ranged';

/** One player of the squad (the bot itself included), as every bot reads it from the same world. */
export interface Member {
  slot: number;
  x: number;
  y: number;
  state: number;
  hp: number;
  maxHp: number;
  human: boolean;
  cls: number;
  role: Role;
  /** Health as a share of the maximum (0..1). */
  frac: number;
  /** Alive and able to act. */
  standing: boolean;
}

/** Everybody in the squad (self included), sorted by slot: the same list, in the same order, for every bot. */
export function squadOf(p: Percept): Member[] {
  const w = p.world;
  const out: Member[] = [];
  const mk = (slot: number, x: number, y: number, state: number, hp: number, maxHp: number, human: boolean): Member => {
    const cls = w.pPerk[slot * PERKS + PERK.Class] ?? 0;
    return { slot, x, y, state, hp, maxHp, human, cls, role: roleOfClass(cls), frac: maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0, standing: state === PlayerState.Alive };
  };
  let placed = false;
  for (const a of p.allies) {
    if (!placed && a.slot > p.slot) {
      out.push(mk(p.slot, p.x, p.y, p.state, p.hp, p.maxHp, false));
      placed = true;
    }
    out.push(mk(a.slot, a.x, a.y, a.state, a.hp, a.maxHp, a.human));
  }
  if (!placed) out.push(mk(p.slot, p.x, p.y, p.state, p.hp, p.maxHp, false));
  return out;
}

/** Who the squad forms around: the nearest standing human, else the standing bot that holds the line (a tank first, then the lowest slot). */
export function anchorOf(me: Member, squad: readonly Member[]): { x: number; y: number; slot: number; human: boolean } | null {
  let best: Member | null = null;
  let bd = Infinity;
  for (const m of squad) {
    if (!m.human || !m.standing) continue;
    const d = (m.x - me.x) ** 2 + (m.y - me.y) ** 2;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (best) return { x: best.x, y: best.y, slot: best.slot, human: true };
  let key: Member | null = null;
  for (const m of squad) {
    if (m.human || !m.standing) continue;
    if (!key || (m.role === 'tank' && key.role !== 'tank')) key = m;
  }
  if (!key) return null;
  if (key.slot !== me.slot) return { x: key.x, y: key.y, slot: key.slot, human: false };
  // the keystone stays loosely with the rest of the squad
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const m of squad) {
    if (m.slot === me.slot || !m.standing) continue;
    sx += m.x;
    sy += m.y;
    n++;
  }
  return n > 0 ? { x: sx / n, y: sy / n, slot: -1, human: false } : null;
}
