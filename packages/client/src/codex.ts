import { CARD_IDS, ENEMY_TYPES, MAP_COUNT, MAX_ENEMIES, MAX_PICKUPS, PERK, PERKS, PickupType, CLASS_IDS, WEAPON_IDS, DRONE_TYPES } from '@wrh/shared';
import type { SimEvent, World } from '@wrh/sim';

/**
 * The Codex: what the player has actually met in a run (as opposed to what the level has opened). One bit per thing, per category.
 * Opening a weapon at a level only lets it appear; it enters the Codex when it shows up in a run.
 */
export const CODEX_SIZES = {
  /** Index in WEAPON_IDS. */
  weapon: WEAPON_IDS.length,
  /** Index in DRONE_TYPES. */
  drone: DRONE_TYPES.length,
  /** Index in CARD_IDS (a card is met when it is first offered). */
  card: CARD_IDS.length,
  /** Index in CLASS_IDS (a class is met when played). */
  class: CLASS_IDS.length,
  /** Index in MAPS. */
  arena: MAP_COUNT,
  /** A PickupType value. */
  powerup: 10,
  /** An elite id (ELITE in the sim). */
  elite: 12,
  /** Index in ENEMY_TYPES. */
  enemy: ENEMY_TYPES.length,
  /** The boss kind (`eBoss` in the sim). */
  boss: 16,
} as const;

export type CodexCategory = keyof typeof CODEX_SIZES;
export const CODEX_CATEGORIES = Object.keys(CODEX_SIZES) as CodexCategory[];

/** Per category, 32 flags to a number. Plain numbers so it saves as JSON. */
export type Codex = Record<CodexCategory, number[]>;

const words = (bits: number): number => (bits + 31) >> 5;

export function emptyCodex(): Codex {
  const out = {} as Codex;
  for (const c of CODEX_CATEGORIES) out[c] = new Array<number>(words(CODEX_SIZES[c])).fill(0);
  return out;
}

/** Read a saved Codex: unknown categories, wrong lengths and non-numbers are dropped, bits beyond a category's size cleared. */
export function sanitizeCodex(raw: unknown): Codex {
  const out = emptyCodex();
  if (!raw || typeof raw !== 'object') return out;
  for (const c of CODEX_CATEGORIES) {
    const saved = (raw as Record<string, unknown>)[c];
    if (!Array.isArray(saved)) continue;
    for (let i = 0; i < out[c].length; i++) {
      const v = saved[i];
      out[c][i] = typeof v === 'number' && Number.isInteger(v) ? v | 0 : 0;
    }
    const spare = CODEX_SIZES[c] & 31;
    if (spare) out[c][out[c].length - 1] = out[c][out[c].length - 1]! & ((1 << spare) - 1);
  }
  return out;
}

export function codexHas(codex: Codex, cat: CodexCategory, index: number): boolean {
  if (index < 0 || index >= CODEX_SIZES[cat]) return false;
  return ((codex[cat][index >> 5]! >>> (index & 31)) & 1) === 1;
}

/** Mark something as met. Returns true when it is new. */
export function codexAdd(codex: Codex, cat: CodexCategory, index: number): boolean {
  if (index < 0 || index >= CODEX_SIZES[cat] || codexHas(codex, cat, index)) return false;
  codex[cat][index >> 5] = codex[cat][index >> 5]! | (1 << (index & 31));
  return true;
}

export function codexCount(codex: Codex, cat: CodexCategory): number {
  let n = 0;
  for (const w of codex[cat]) for (let v = w >>> 0; v; v &= v - 1) n++;
  return n;
}

/** Everything a category holds as a bit mask (for the weapon and drone categories, which fit one number: this is what the sim takes). */
export function codexMask(codex: Codex, cat: 'weapon' | 'drone'): number {
  return codex[cat][0]!;
}

/** Fold the Codex of a run into another (the saved one). Returns the discoveries that were new there. */
export function codexMerge(into: Codex, from: Codex): Discovery[] {
  const out: Discovery[] = [];
  for (const cat of CODEX_CATEGORIES) {
    for (let i = 0; i < CODEX_SIZES[cat]; i++) if (codexHas(from, cat, i) && codexAdd(into, cat, i)) out.push({ cat, index: i });
  }
  return out;
}

export interface Discovery {
  cat: CodexCategory;
  index: number;
}

/**
 * Watches one run for first meetings. Keeps its own copy of the Codex so a discovery is announced once, however often it shows
 * up; the new ones are listed in `found` (in order) for the corner card and for the game over screen.
 */
export class RunCodex {
  readonly codex: Codex;
  readonly found: Discovery[] = [];

  constructor(saved: Codex) {
    this.codex = sanitizeCodex(saved);
  }

  private add(cat: CodexCategory, index: number): Discovery | null {
    if (!codexAdd(this.codex, cat, index)) return null;
    const d = { cat, index };
    this.found.push(d);
    return d;
  }

  /** A simulation event of the local player: a fresh weapon, a fresh drone, the first offer of a card. */
  onEvent(e: SimEvent, slot: number): Discovery[] {
    const out: (Discovery | null)[] = [];
    if (e.type === 'weaponGet' && e.slot === slot && e.fresh) out.push(this.add('weapon', e.weapon));
    else if (e.type === 'droneUnlock' && e.slot === slot && e.fresh) out.push(this.add('drone', e.kind));
    else if (e.type === 'cardOffer' && e.slot === slot) for (const c of e.cards) out.push(this.add('card', c));
    return out.filter((d): d is Discovery => d !== null);
  }

  /** Look at the world: the arena and class in play, and the enemies, elites, bosses and power-ups on the field. Cheap enough to call every second or so. */
  scan(w: World, slot: number): Discovery[] {
    const out: (Discovery | null)[] = [this.add('arena', w.map)];
    if (w.pActive[slot]) out.push(this.add('class', w.pPerk[slot * PERKS + PERK.Class]!));
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!w.eActive[i]) continue;
      out.push(this.add('enemy', w.eType[i]!));
      if (w.eMod[i]) out.push(this.add('elite', w.eMod[i]!));
      if (w.eBoss[i]) out.push(this.add('boss', w.eBoss[i]! & 15));
    }
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!w.kActive[i]) continue;
      const k = w.kType[i]!;
      if (k >= PickupType.Shield && k <= PickupType.Freeze) out.push(this.add('powerup', k));
    }
    return out.filter((d): d is Discovery => d !== null);
  }
}
