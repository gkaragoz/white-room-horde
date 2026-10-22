import { botLoadouts, SKILLS, type BotLoadout, type Skill } from '@wrh/bot';
import { CLASS_IDS, MAX_PLAYERS, WEAPON_IDS, poolAt, type WeaponId } from '@wrh/shared';
import { CLASS_GATE } from './meta';

/**
 * Companion bots: the player-facing rules. How many, how well they play, which classes and guns they start with, and what they
 * cost in experience. The brain itself is packages/bot; the net layer (packages/net) carries the host's bot inputs to the room.
 */

/** Companions in a solo game (the squad is the player and up to seven of them). */
export const MAX_COMPANIONS = 7;
/** Each companion takes this much off the experience of a run (see `xpFactor`). */
export const XP_PER_COMPANION = 0.25;

export const DEFAULT_SKILL: Skill = 'expert';

export interface CompanionChoice {
  count: number;
  skill: Skill;
}

export const isSkill = (v: unknown): v is Skill => typeof v === 'string' && (SKILLS as readonly string[]).includes(v);

/** How many companions a squad of `people` humans may add: up to seven, never more than the room has slots for. */
export function companionLimit(people: number): number {
  return Math.max(0, Math.min(MAX_COMPANIONS, MAX_PLAYERS - Math.max(1, people)));
}

/** The share of the experience a run keeps with this many companions: 1 for none, 1/1.25 for one, 1/2 for four. */
export function xpFactor(companions: number): number {
  return 1 / (1 + XP_PER_COMPANION * Math.max(0, Math.floor(companions) || 0));
}

/** The experience of a run with companions: the usual tenth of the team score, divided by `1 + 0.25 * companions`, rounded. */
export function scaledXp(baseXp: number, companions: number): number {
  return Math.max(0, Math.round(baseXp * xpFactor(companions)));
}

const KEY = 'wrh.companions';

/** What the player chose last time (solo). */
export function loadCompanions(): CompanionChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CompanionChoice> | null;
    const count = typeof raw?.count === 'number' && Number.isInteger(raw.count) ? Math.max(0, Math.min(MAX_COMPANIONS, raw.count)) : 0;
    return { count, skill: isSkill(raw?.skill) ? raw.skill : DEFAULT_SKILL };
  } catch {
    return { count: 0, skill: DEFAULT_SKILL };
  }
}

export function saveCompanions(c: CompanionChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode: the choice is simply not remembered */
  }
}

/** The dev override: `?bots=N` and `?botskill=...` replace the menu choice (and start a game without the menu, see main.ts). */
export function companionsFromUrl(search: string, base: CompanionChoice): { choice: CompanionChoice; forced: boolean } {
  const q = new URLSearchParams(search);
  const rawN = q.get('bots');
  const n = rawN === null || rawN.trim() === '' ? NaN : Number(rawN);
  const skill = q.get('botskill');
  const forced = Number.isFinite(n);
  return {
    forced,
    choice: {
      count: forced ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(n))) : base.count,
      skill: isSkill(skill) ? skill : base.skill,
    },
  };
}

/** CLASS_IDS indices a bot may be given: what the room's level opens, plus the achievement classes of the player who sets the room up. */
export function botClasses(roomLevel: number, achClasses = 0): number[] {
  const open = poolAt(roomLevel).classes | achClasses;
  const out: number[] = [];
  for (let i = 0; i < CLASS_IDS.length; i++) if (((open >> i) & 1) === 1) out.push(i);
  return out;
}

/** The mask of achievement classes (the ones the track does not open) a profile holds, taken from an `unlocked().classes` mask. */
export function achievementClassMask(classes: number): number {
  let m = 0;
  for (const cls of Object.keys(CLASS_GATE)) {
    const i = CLASS_IDS.indexOf(cls as (typeof CLASS_IDS)[number]);
    if (i >= 0) m |= classes & (1 << i);
  }
  return m;
}

export interface CompanionPlan {
  count: number;
  /** Slots that are free for them (ascending). */
  freeSlots: readonly number[];
  /** Picks the names and so on; the same seed gives the same squad. */
  seed: number;
  /** The meta level the room plays at (the lowest of its people). */
  roomLevel: number;
  /** Mask of the achievement classes of whoever sets the room up. */
  achClasses?: number;
  /** Classes the people already play (bots take others while there are some). */
  taken?: readonly number[];
}

/**
 * The classes, guns and names of the companions. A gun the room's level has not opened is swapped for the SMG, which is always open;
 * a bot takes only classes the level allows.
 */
export function planCompanions(p: CompanionPlan): BotLoadout[] {
  const pool = poolAt(p.roomLevel);
  const loads = botLoadouts(p.freeSlots, Math.min(MAX_PLAYERS - 1, Math.max(0, p.count)), p.seed, botClasses(p.roomLevel, p.achClasses ?? 0), p.taken ?? []);
  return loads.map((l) => {
    const idx = WEAPON_IDS.indexOf(l.weapon);
    const open = l.weapon === 'pistol' || l.weapon === 'smg' || (idx >= 0 && ((pool.weapons >> idx) & 1) === 1);
    return open ? l : { ...l, weapon: 'smg' as WeaponId };
  });
}

/** Free slots of a squad: the numbers below MAX_PLAYERS that `taken` does not hold. */
export function freeSlots(taken: Iterable<number>): number[] {
  const used = new Set(taken);
  const out: number[] = [];
  for (let s = 0; s < MAX_PLAYERS; s++) if (!used.has(s)) out.push(s);
  return out;
}

/** The glyph that marks a bot in plain text (name tags and arrows over the world). */
export const BOT_GLYPH = '⚙';

/** A small robot head for the lists (the HUD squad, the room). */
export const BOT_BADGE = '<svg class="wrh-botbadge" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1v2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="1.2" r="1" fill="currentColor"/><rect x="2.5" y="3.5" width="11" height="8" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5.7" cy="7.4" r="1.15" fill="currentColor"/><circle cx="10.3" cy="7.4" r="1.15" fill="currentColor"/><path d="M5.5 13.6h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
