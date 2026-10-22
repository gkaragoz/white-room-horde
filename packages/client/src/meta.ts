import { CLASS_IDS, MIN_XP_RUN_SECONDS, PLAYER_COLORS, TRACK, WEAPON_IDS, BALANCE, levelFromXp, poolAt, runXp, type Pool, type TrackItem, type WeaponId } from '@wrh/shared';
import { codexHas } from './codex';
import { ACCESSORIES, type Profile } from './profile';

/**
 * META.enabled: whether the game runs on the meta progression: the pool and enemy pressure by level, locked classes, looks, arenas and
 * multipliers, the migration of an old profile. Off, the game plays as before (everything open, full pressure) while XP and the
 * Codex are still collected, so nothing the player sees changes until the screens for the new system are in.
 */
export const META = { enabled: false };

/** The achievement that opens each class that is not on the track. (The achievements themselves arrive with the new table.) */
export const CLASS_GATE: Readonly<Record<string, string>> = {
  demolisher: 'sig_demolisher',
  ranger: 'sig_ranger',
  berserker: 'sig_berserker',
  hammerer: 'sig_hammerer',
};

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

/** XP a finished run is worth: a tenth of the team score, nothing for a run shorter than 15 seconds. */
export function xpForRun(teamScore: number, seconds: number): number {
  return seconds >= MIN_XP_RUN_SECONDS ? runXp(teamScore) : 0;
}

/** The track items that opening levels (from, to] give. */
export function rewardsBetween(from: number, to: number): TrackItem[] {
  return TRACK.filter((i) => i.level > from && i.level <= to && !i.bundled);
}

/** A stable key for a track item, used for the "new!" badges. */
export const itemKey = (i: TrackItem): string => `${i.cat}:${i.name}`;

