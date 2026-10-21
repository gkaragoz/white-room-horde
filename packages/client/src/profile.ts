import type { WeaponId } from '@wrh/shared';

/** Everything the game remembers about the player between sessions (local only). */
export interface Profile {
  bestWave: number;
  bestKills: number;
  games: number;
  totalKills: number;
  /** Accessory chosen for the character (index into ACCESSORIES). */
  acc: number;
  /** Vest colour (index into PLAYER_COLORS, -1: the slot's own colour). */
  color: number;
  /** Class chosen for the character (index into CLASS_IDS). */
  cls: number;
  /** Last solo options. */
  map: number;
  /** The difficulty multipliers chosen last (a bit mask over MODS). */
  mods: number;
  /** Best final score (floors, kills, bosses and time, times the multiplier). */
  bestScore: number;
}

export const ACCESSORIES = ['acc_bandana', 'acc_cap', 'acc_goggles', 'acc_headphones', 'acc_helmet', 'acc_crown', 'acc_horns', 'acc_tophat', 'acc_cowboy', 'acc_ninja', 'acc_mohawk', 'acc_bunny', 'acc_visor',
  'acc_pirate', 'acc_wizard', 'acc_viking', 'acc_santa', 'acc_chef', 'acc_astronaut', 'acc_cat', 'acc_halo', 'acc_alien', 'acc_gasmask', 'acc_beanie', 'acc_samurai', 'acc_shades', 'acc_flowers'] as const;

/** Best wave a player has to reach before a starting weapon unlocks (the first three are free). */
export const WEAPON_UNLOCK: Record<WeaponId, number> = { pistol: 0, smg: 0, ar: 0, shotgun: 3, hmg: 5, sniper: 7, minigun: 9, revolver: 2, mp: 4, dbl: 6, dmr: 8, flamer: 10, gl: 12, sword: 0, hammer: 0, akimbo: 6, nailgun: 9, crossbow: 12, arcthrower: 15, autoshotgun: 18, plasma: 21, frostgun: 24, sawlauncher: 28, rocket: 32, railgun: 38 };

const KEY = 'wrh.profile';
const DEFAULT: Profile = { bestWave: 1, bestKills: 0, games: 0, totalKills: 0, acc: 0, color: -1, cls: 0, map: -1, mods: 0, bestScore: 0 };

export function loadProfile(): Profile {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Profile>) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: progress simply is not remembered */
  }
}

/** Fold a finished run into the profile; reports what improved so the game over screen can say so. */
export function recordGame(wave: number, kills: number, score = 0): { newWave: boolean; newKills: boolean; unlocked: WeaponId[]; profile: Profile } {
  const p = loadProfile();
  const before = p.bestWave;
  const newWave = wave > p.bestWave;
  const newKills = kills > p.bestKills;
  p.bestWave = Math.max(p.bestWave, wave);
  p.bestKills = Math.max(p.bestKills, kills);
  p.bestScore = Math.max(p.bestScore, score);
  p.games++;
  p.totalKills += kills;
  saveProfile(p);
  const unlocked = (Object.keys(WEAPON_UNLOCK) as WeaponId[]).filter((w) => WEAPON_UNLOCK[w] > before && WEAPON_UNLOCK[w] <= p.bestWave);
  return { newWave, newKills, unlocked, profile: p };
}

export function isUnlocked(weapon: WeaponId, p: Profile = loadProfile()): boolean {
  return p.bestWave >= WEAPON_UNLOCK[weapon];
}

/** Remember how to get back into a running online game after a dropped connection (tab-scoped, ten minutes). */
export interface RejoinInfo {
  server: string;
  code: string;
  token: string;
  /** Game version it was saved with: another major.minor cannot rejoin (the relay refuses), so the menu hides the button. */
  v?: string;
  at: number;
}

export function saveRejoin(info: Omit<RejoinInfo, 'at'>): void {
  try {
    sessionStorage.setItem('wrh.rejoin', JSON.stringify({ ...info, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function loadRejoin(): RejoinInfo | null {
  try {
    const r = JSON.parse(sessionStorage.getItem('wrh.rejoin') ?? 'null') as RejoinInfo | null;
    return r && Date.now() - r.at < 10 * 60 * 1000 ? r : null;
  } catch {
    return null;
  }
}

export function clearRejoin(): void {
  try {
    sessionStorage.removeItem('wrh.rejoin');
  } catch {
    /* ignore */
  }
}
