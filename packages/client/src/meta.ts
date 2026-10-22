import { SIGNATURE_ACHIEVEMENTS, BALANCE, CARD_IDS, CARD_PACKS, CLASS_IDS, DRONE_TYPES, ELITE_NAMES, MAPS, MIN_XP_RUN_SECONDS, PLAYER_COLORS, PickupType, TRACK, WEAPON_IDS, levelFromXp, poolAt, runXp, type Pool, type TrackItem, type WeaponId } from '@wrh/shared';
import { CODEX_CATEGORIES, CODEX_SIZES, codexHas, type Codex, type CodexCategory } from './codex';
import { ACCESSORIES, type Profile } from './profile';

/**
 * Whether the game runs on the meta progression: the pool and enemy pressure by level, locked classes, looks, arenas and
 * multipliers, the migration of an old profile. The game decides at start-up (`initMeta`); until then, and in code that never
 * calls it (the unit tests, the in-page QA), it is off and the game plays as before: everything open, full pressure.
 */
export const META = { enabled: false };

/** The achievement that opens each class that is not on the track (the signature achievements of the table). */
export const CLASS_GATE: Readonly<Record<string, string>> = SIGNATURE_ACHIEVEMENTS;

/** Accessories every player has from the start; the others come with a level (the track's cosmetic column). */
const CORE_ACCESSORIES = ['acc_bandana', 'acc_cap', 'acc_goggles'];
/** Vest colours every player has from the start (the first two; "auto" is always there). */
const CORE_COLORS = 2;

export const levelOf = (p: Pick<Profile, 'xp'>): number => levelFromXp(p.xp);

/** The meta level at which an accessory opens (1 for the starting ones); undefined for a name the track does not know. */
export function accessoryLevel(index: number): number {
  const id = ACCESSORIES[index];
  if (!id || CORE_ACCESSORIES.includes(id)) return 1;
  const hit = TRACK.find((i) => i.cat === 'cosmetic' && `acc_${i.name}` === id);
  return hit ? hit.level : 1;
}

/** The meta level at which a vest colour opens (the track names them "renk 3", "renk 4", ... counting from 1). */
export function colorLevel(index: number): number {
  if (index < CORE_COLORS) return 1;
  const hit = TRACK.find((i) => i.cat === 'cosmetic' && i.name === `renk ${index + 1}`);
  return hit ? hit.level : 1;
}

export interface Unlocked {
  level: number;
  pool: Pool;
  /** Bit n = CLASS_IDS[n]: the track's classes plus the achievement classes the player has earned. */
  classes: number;
  accessories: boolean[];
  /** Index n = PLAYER_COLORS[n]. The automatic colour (-1) is always open. */
  colors: boolean[];
  arenas: number;
  mods: number;
}

/** What a profile has open: derived from its XP (the level) and its achievements, never stored. */
export function unlocked(p: Pick<Profile, 'xp' | 'ach'>): Unlocked {
  const level = levelOf(p);
  const pool = poolAt(level);
  let classes = pool.classes;
  for (const [cls, ach] of Object.entries(CLASS_GATE)) if (p.ach.got[ach]) classes |= 1 << CLASS_IDS.indexOf(cls as (typeof CLASS_IDS)[number]);
  return {
    level,
    pool,
    classes,
    accessories: ACCESSORIES.map((_, i) => accessoryLevel(i) <= level),
    colors: PLAYER_COLORS.map((_, i) => colorLevel(i) <= level),
    arenas: pool.arenas,
    mods: pool.mods,
  };
}

/** The guns a player may start a run with: the pistol and the SMG, and any gun of the open pool met in the Codex. */
export function startWeapons(p: Pick<Profile, 'xp' | 'codex'>): WeaponId[] {
  const pool = poolAt(levelOf(p));
  return WEAPON_IDS.filter((id, i) => !BALANCE.weapons[id].melee && (id === 'pistol' || id === 'smg' || (((pool.weapons >> i) & 1) === 1 && codexHas(p.codex, 'weapon', i))));
}

/** Put the last choices back to the defaults wherever they name something that is not open (an edited save, an older save, a lost achievement). */
export function sanitizeChoices(p: Profile): void {
  const u = unlocked(p);
  if (((u.classes >> p.cls) & 1) === 0) p.cls = 0;
  if (!u.accessories[p.acc]) p.acc = 0;
  if (p.color >= 0 && !u.colors[p.color]) p.color = -1;
  if (p.map >= 0 && ((u.arenas >> p.map) & 1) === 0) p.map = -1;
  p.mods &= u.mods;
}

/** What to tell a room about this player: the level and the weapons and drones met. The full game while the meta progression is off. */
export function joinMeta(p: Pick<Profile, 'xp' | 'codex'>): { lvl: number; metW: number; metD: number } {
  if (!META.enabled) return { lvl: 100, metW: -1, metD: -1 };
  return { lvl: levelOf(p), metW: p.codex.weapon[0]!, metD: p.codex.drone[0]! };
}

/** What the sim takes for a solo run or a room: the same as `joinMeta`, in the sim's names. */
export function setupMeta(p: Pick<Profile, 'xp' | 'codex'>): { level: number; metWeapons: number; metDrones: number } {
  const m = joinMeta(p);
  return { level: m.lvl, metWeapons: m.metW, metDrones: m.metD };
}

/**
 * XP a finished run is worth: a tenth of the team score, nothing for a run shorter than 15 seconds. Companion bots in the squad
 * take their share: it is divided by 1 + 0.25 per companion (see `xpFactor` in companions.ts), then rounded.
 */
export function xpForRun(teamScore: number, seconds: number, companions = 0): number {
  if (seconds < MIN_XP_RUN_SECONDS) return 0;
  const n = Math.max(0, Math.floor(companions) || 0);
  return Math.round(runXp(teamScore) / (1 + 0.25 * n));
}

/** The track items that opening levels (from, to] give. */
export function rewardsBetween(from: number, to: number): TrackItem[] {
  return TRACK.filter((i) => i.level > from && i.level <= to && !i.bundled);
}

/** A stable key for a track item, used for the "new!" badges. */
export const itemKey = (i: TrackItem): string => `${i.cat}:${i.name}`;


/** Where the Codex looks up what to list in a category (indices into its lists). Melee weapons are class gear and not listed. */
export function catalog(cat: CodexCategory): number[] {
  const all = (n: number, from = 0): number[] => Array.from({ length: n - from }, (_, i) => i + from);
  switch (cat) {
    case 'weapon':
      return WEAPON_IDS.map((id, i) => (BALANCE.weapons[id].melee ? -1 : i)).filter((i) => i >= 0);
    case 'powerup':
      return [PickupType.Shield, PickupType.Haste, PickupType.Quad, PickupType.Nuke, PickupType.Freeze];
    case 'elite':
      return all(ELITE_NAMES.length, 1);
    case 'boss':
      return all(12, 1);
    default:
      return all(CODEX_SIZES[cat]);
  }
}

/** The Codex counts the Codex achievements are checked against (`codex...` stats of the table). */
export function codexTotals(codex: Codex): Record<string, number> {
  const n = (cat: CodexCategory): number => catalog(cat).filter((i) => codexHas(codex, cat, i)).length;
  return { codexWeapons: n('weapon'), codexDrones: n('drone'), codexEnemies: n('enemy'), codexBosses: n('boss'), codexElites: n('elite'), codexArenas: n('arena') };
}

/** Total entries the Codex lists, over all categories. */
export const CATALOG_TOTAL = CODEX_CATEGORIES.reduce((n, c) => n + catalog(c).length, 0);

/** How many entries the player has met. */
export function catalogFound(codex: Codex): number {
  return CODEX_CATEGORIES.reduce((n, c) => n + catalog(c).filter((i) => codexHas(codex, c, i)).length, 0);
}

const POWERUP_NAMES: Record<number, string> = { [PickupType.Shield]: 'shield', [PickupType.Haste]: 'haste', [PickupType.Quad]: 'quad', [PickupType.Nuke]: 'nuke', [PickupType.Freeze]: 'freeze' };

/** The pack a card belongs to, by card index. */
const PACK_OF_CARD = new Map<string, string>(Object.entries(CARD_PACKS).flatMap(([pack, ids]) => ids.map((id) => [id, pack] as [string, string])));

/**
 * What opens a Codex entry: the meta level (0 = from the start), 'ach' for a class that comes with an achievement, or null when
 * it is not gated (enemies and bosses appear as the waves bring them).
 */
export function unlockLevelOf(cat: CodexCategory, index: number): number | 'ach' | null {
  const at = (trackCat: TrackItem['cat'], name: string): number | null => TRACK.find((i) => i.cat === trackCat && i.name === name)?.level ?? null;
  switch (cat) {
    case 'weapon':
      return at('weapon', WEAPON_IDS[index]!) ?? 0;
    case 'drone':
      return at('drone', DRONE_TYPES[index]!);
    case 'class': {
      const id = CLASS_IDS[index]!;
      return id in CLASS_GATE ? 'ach' : (at('class', id) ?? 0);
    }
    case 'arena':
      return at('arena', MAPS[index]!.id) ?? 0;
    case 'powerup':
      return at('powerup', POWERUP_NAMES[index] ?? '');
    case 'elite':
      return at('elite', ELITE_NAMES[index] ?? '');
    case 'card': {
      const pack = PACK_OF_CARD.get(CARD_IDS[index]!);
      if (!pack || pack === 'core') return 0;
      if (/^(demolisher|ranger|berserker|hammerer):basic$/.test(pack)) return 'ach';
      return at('pack', pack);
    }
    default:
      return null;
  }
}

/** Is a Codex entry open to the player now (met, or opened by the level)? */
export function isOpen(p: Pick<Profile, 'xp' | 'codex' | 'ach'>, cat: CodexCategory, index: number): boolean {
  if (codexHas(p.codex, cat, index)) return true;
  const at = unlockLevelOf(cat, index);
  if (at === null) return false;
  if (at === 'ach') return cat === 'class' ? ((unlocked(p).classes >> index) & 1) === 1 : ((unlocked(p).classes >> CLASS_IDS.indexOf(cardClassOf(index))) & 1) === 1;
  return at <= levelOf(p);
}

function cardClassOf(index: number): (typeof CLASS_IDS)[number] {
  const pack = PACK_OF_CARD.get(CARD_IDS[index]!) ?? '';
  return (pack.split(':')[0] as (typeof CLASS_IDS)[number]) || 'soldier';
}

/**
 * Decide whether the game runs on the meta progression. On by default. `?meta=0` turns it off for this browser (kept in
 * `wrh.meta`), `?meta=1` back on. An automated browser (`navigator.webdriver`: the QA scripts that play every class and arena)
 * gets the classic game unless it asks for `?meta=1`, so those checks keep seeing everything open.
 */
export function initMeta(): void {
  try {
    const ask = new URLSearchParams(location.search).get('meta');
    if (ask === '0') localStorage.setItem('wrh.meta', '0');
    else if (ask === '1') localStorage.removeItem('wrh.meta');
    const robot = typeof navigator !== 'undefined' && navigator.webdriver === true && ask !== '1';
    META.enabled = !robot && localStorage.getItem('wrh.meta') !== '0';
  } catch {
    META.enabled = true;
  }
}
