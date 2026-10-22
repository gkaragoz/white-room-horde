import { withOptions, type TrackItem, type WeaponId } from '@wrh/shared';

import { emptyStore, type AchStore } from './achStore';
import { codexMerge, emptyCodex, sanitizeCodex, type Codex, type Discovery } from './codex';
import { META, levelOf, rewardsBetween, itemKey, sanitizeChoices, xpForRun } from './meta';

export { emptyStore, type AchStore };

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
  ach: AchStore;
  /** 2 once the profile has been moved to the meta progression (see `loadProfile`). */
  v?: 2;
  /** Total experience: the meta level is derived from it. Collected from the first run, whether or not the meta progression is on. */
  xp: number;
  /** What the player has met in runs. */
  codex: Codex;
  /** Track items opened by a level-up that the player has not looked at yet (`cat:name` keys): the "new!" badges. */
  seenNew: string[];
  /** The one-time notes (the new progression system) the player has been shown. */
  introSeen: boolean;
}

export const ACCESSORIES = ['acc_bandana', 'acc_cap', 'acc_goggles', 'acc_headphones', 'acc_helmet', 'acc_crown', 'acc_horns', 'acc_tophat', 'acc_cowboy', 'acc_ninja', 'acc_mohawk', 'acc_bunny', 'acc_visor',
  'acc_pirate', 'acc_wizard', 'acc_viking', 'acc_santa', 'acc_chef', 'acc_astronaut', 'acc_cat', 'acc_halo', 'acc_alien', 'acc_gasmask', 'acc_beanie', 'acc_samurai', 'acc_shades', 'acc_flowers'] as const;

/** Best wave a player has to reach before a starting weapon unlocks (the first three are free). */
export const WEAPON_UNLOCK: Record<WeaponId, number> = { pistol: 0, smg: 0, ar: 0, shotgun: 3, hmg: 5, sniper: 7, minigun: 9, revolver: 2, mp: 4, dbl: 6, dmr: 8, flamer: 10, gl: 12, sword: 0, hammer: 0, akimbo: 6, nailgun: 9, crossbow: 12, arcthrower: 15, autoshotgun: 18, plasma: 21, frostgun: 24, sawlauncher: 28, rocket: 32, railgun: 38 };

const KEY = 'wrh.profile';
const DEFAULT: Profile = { bestWave: 1, bestKills: 0, games: 0, totalKills: 0, acc: 0, color: -1, cls: 0, map: -1, mods: 0, bestScore: 0, ach: emptyStore(), xp: 0, codex: emptyCodex(), seenNew: [], introSeen: true };
/** Where an old profile is kept when it is moved to the meta progression. */
const BACKUP_KEY = 'wrh.profile.v1';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = JSON.parse(raw ?? '{}') as Partial<Profile>;
    const migrate = META.enabled && saved.v !== 2;
    const ach = emptyStore();
    // the old progress (achievements, experience) does not carry over to the meta progression: it is kept aside and the records stay
    if (migrate && raw) {
      try {
        if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    if (!migrate) {
      Object.assign(ach.life, saved.ach?.life);
      Object.assign(ach.best, saved.ach?.best);
      Object.assign(ach.got, saved.ach?.got);
      Object.assign(ach.seen, saved.ach?.seen);
    }
    // what was saved may be from an older build or edited by hand: keep only an arena and a Difficulty this build knows
    const { map, mods } = withOptions({ map: DEFAULT.map, mods: DEFAULT.mods }, saved);
    const xp = migrate ? 0 : typeof saved.xp === 'number' && saved.xp > 0 ? Math.floor(saved.xp) : 0;
    const seenNew = migrate || !Array.isArray(saved.seenNew) ? [] : saved.seenNew.filter((k): k is string => typeof k === 'string');
    const p: Profile = {
      ...DEFAULT,
      ...saved,
      map,
      mods,
      ach,
      xp,
      codex: migrate ? emptyCodex() : sanitizeCodex(saved.codex),
      seenNew,
      // a player with an old save is told about the new system once; a brand new one has nothing to be told
      introSeen: migrate ? !raw : saved.introSeen !== false,
    };
    if (META.enabled) {
      p.v = 2;
      sanitizeChoices(p);
    }
    return p;
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
export interface RunMeta {
  /** The team score of the run (the experience is a tenth of it). */
  teamScore: number;
  /** How long the run lasted. */
  seconds: number;
  /** What the run met. */
  codex?: Codex;
}

/** What a run changed in the meta progression. */
export interface MetaResult {
  xp: number;
  levelBefore: number;
  levelAfter: number;
  /** The track items the levels reached opened. */
  rewards: TrackItem[];
  /** First meetings of the run. */
  discoveries: Discovery[];
}

export function recordGame(wave: number, kills: number, score = 0, run?: RunMeta): { newWave: boolean; newKills: boolean; unlocked: WeaponId[]; profile: Profile; meta: MetaResult } {
  const p = loadProfile();
  const before = p.bestWave;
  const newWave = wave > p.bestWave;
  const newKills = kills > p.bestKills;
  p.bestWave = Math.max(p.bestWave, wave);
  p.bestKills = Math.max(p.bestKills, kills);
  p.bestScore = Math.max(p.bestScore, score);
  p.games++;
  p.totalKills += kills;
  // experience and first meetings: added to what is saved right now (a second tab may have added its own)
  const levelBefore = levelOf(p);
  const xp = run ? xpForRun(run.teamScore, run.seconds) : 0;
  p.xp += xp;
  const discoveries = run?.codex ? codexMerge(p.codex, run.codex) : [];
  const levelAfter = levelOf(p);
  const rewards = rewardsBetween(levelBefore, levelAfter);
  for (const r of rewards) if (!p.seenNew.includes(itemKey(r))) p.seenNew.push(itemKey(r));
  saveProfile(p);
  const unlocked = (Object.keys(WEAPON_UNLOCK) as WeaponId[]).filter((w) => WEAPON_UNLOCK[w] > before && WEAPON_UNLOCK[w] <= p.bestWave);
  return { newWave, newKills, unlocked, profile: p, meta: { xp, levelBefore, levelAfter, rewards, discoveries } };
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
