import { ACHIEVEMENTS, CLASS_IDS, MAX_PLAYERS, MODS, MOD_COUNT, PERK, PERKS, STAT, STATS, WEAPON_IDS, WEAPON_SLOTS, type AchievementDef } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { asset } from './assets';
import { loadProfile, saveProfile, type AchStore } from './profile';
import { runScore } from './modsUi';
import type { Lang } from './ui';

export type Totals = Record<string, number>;

/** The numbers of one character's run, in the keys the achievement table names. */
export function runTotals(world: World, slot: number): { totals: Totals; flags: Record<string, boolean> } {
  const st = (k: number): number => world.pStat[slot * STATS + k]!;
  const perk = (k: number): number => world.pPerk[slot * PERKS + k]!;
  const seconds = st(STAT.AliveTicks) / 30;
  let cards = 0;
  for (let i = 0; i < world.pCards.length / MAX_PLAYERS; i++) cards += world.pCards[slot * (world.pCards.length / MAX_PLAYERS) + i]!;
  const mods = world.mods;
  let modCount = 0;
  for (let i = 0; i < MOD_COUNT; i++) if ((mods >> i) & 1) modCount++;
  const totals: Totals = {
    kills: perk(PERK.Kills),
    runKills: perk(PERK.Kills),
    damage: perk(PERK.Damage),
    bosses: st(STAT.BossKills),
    floor: world.wave,
    maxHit: st(STAT.MaxHit),
    crits: st(STAT.Crits),
    shots: st(STAT.Shots),
    revives: st(STAT.Revives),
    distance: st(STAT.Distance),
    dashes: st(STAT.Dashes),
    abilities: st(STAT.Abilities),
    grenades: st(STAT.Grenades),
    barrels: st(STAT.Barrels),
    pickups: st(STAT.Pickups),
    healed: st(STAT.Healed),
    taken: st(STAT.DamageTaken),
    games: 1,
    seconds,
    level: world.pLevel[slot]!,
    cards,
    modsFloor5: world.wave >= 5 ? modCount : 0,
    score: runScore(world).final,
  };
  for (let i = 0; i < WEAPON_IDS.length; i++) totals[`wk:${WEAPON_IDS[i]}`] = world.pWpnKills[slot * WEAPON_SLOTS + i]!;
  const cls = perk(PERK.Class);
  for (let c = 0; c < CLASS_IDS.length; c++) totals[`floor:${c}`] = c === cls ? world.wave : 0;
  const pistolOnly = world.pOwned[slot] === 1 << WEAPON_IDS.indexOf('pistol');
  const fragileBit = 1 << MODS.findIndex((m) => m.id === 'fragile');
  const flags: Record<string, boolean> = {
    untouchable: world.wave >= 5 && totals.taken! <= 50,
    quickDeath: seconds < 60,
    pistolOnly: pistolOnly && world.wave >= 10,
    fragileFloor8: (mods & fragileBit) !== 0 && world.wave >= 8,
    allMods: mods === 2 ** MOD_COUNT - 1 && world.wave >= 5,
    revive5: totals.revives! >= 5,
    barrels50: totals.barrels! >= 50,
    hourRun: seconds >= 3600,
    flawlessBosses: totals.bosses! >= 3 && st(STAT.Downs) === 0,
    cards100: cards >= 100,
  };
  return { totals, flags };
}

/** The value of an achievement now (a running total, a best run, or 0 / 1 for a special condition). */
export function valueOf(def: AchievementDef, store: AchStore): number {
  if (def.kind === 'life') return store.life[def.stat] ?? 0;
  if (def.kind === 'best') return store.best[def.stat] ?? 0;
  return store.got[def.id] ? 1 : 0;
}

export const isGot = (def: AchievementDef, store: AchStore): boolean => !!store.got[def.id];

/** Fold a finished run in; returns the achievements it earned. The store is changed in place. */
export function applyRun(store: AchStore, run: { totals: Totals; flags: Record<string, boolean> }, now = Date.now()): AchievementDef[] {
  // several achievements share a stat (the tiers of one group): fold each stat in once
  const folded = new Set<string>();
  for (const def of ACHIEVEMENTS) {
    const v = run.totals[def.stat];
    if (v === undefined || def.kind === 'flag' || folded.has(def.stat)) continue;
    folded.add(def.stat);
    if (def.kind === 'life') store.life[def.stat] = (store.life[def.stat] ?? 0) + v;
    else store.best[def.stat] = Math.max(store.best[def.stat] ?? 0, v);
  }
  const earned: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (store.got[def.id]) continue;
    const done = def.kind === 'flag' ? run.flags[def.stat] === true : valueOf(def, store) >= def.target;
    if (!done) continue;
    store.got[def.id] = now;
    earned.push(def);
  }
  return earned;
}

/** Record a run into the saved profile; the earned achievements come back for the game over screen. */
export function recordAchievements(world: World, slot: number): AchievementDef[] {
  const p = loadProfile();
  const earned = applyRun(p.ach, runTotals(world, slot));
  saveProfile(p);
  return earned;
}

export const unreadCount = (store: AchStore): number => Object.keys(store.got).filter((id) => !store.seen[id]).length;

export function markSeen(): void {
  const p = loadProfile();
  for (const id of Object.keys(p.ach.got)) p.ach.seen[id] = 1;
  saveProfile(p);
}

/** How many to show: 533.223 (the thousands separated the way the language writes them). */
export function fmtNum(n: number, lang: Lang): string {
  const v = Math.floor(n);
  const sep = lang === 'en' ? ',' : '.';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

interface Words {
  title: string;
  earned: string;
  hidden: string;
  hiddenText: string;
  done: string;
  close: string;
  runTitle: string;
  stat: Record<string, string>;
  flag: Record<string, string>;
  classFloor: string;
}

const W: Record<string, Words> = {
  en: {
    title: 'Achievements',
    earned: 'earned',
    hidden: '???',
    hiddenText: 'A hidden achievement: keep playing to find out how to get it.',
    done: 'Earned',
    close: 'Back',
    runTitle: 'Achievements earned in this run',
    stat: {
      kills: 'Defeat {n} enemies in total',
      runKills: 'Defeat {n} enemies in a single run',
      damage: 'Deal {n} damage in total',
      bosses: 'Defeat {n} bosses in total',
      floor: 'Reach floor {n}',
      maxHit: 'Land a single hit of {n} damage',
      crits: 'Land {n} critical hits in total',
      shots: 'Fire {n} shots in total',
      revives: 'Revive {n} teammates in total',
      distance: 'Run {n} meters in total',
      dashes: 'Dash {n} times in total',
      abilities: 'Use your class ability {n} times in total',
      grenades: 'Throw {n} grenades in total',
      barrels: 'Blow up {n} barrels in total',
      pickups: 'Collect {n} pickups in total',
      healed: 'Regain {n} health in total',
      taken: 'Take {n} damage in total',
      games: 'Play {n} runs',
      seconds: 'Survive {n} seconds in total',
      level: 'Reach level {n} in a run',
      cards: 'Hold {n} cards in a single run',
      modsFloor5: 'Reach floor 5 with {n} difficulty multipliers on',
      score: 'Score {n} points in a run',
      weapon: 'Defeat {n} enemies with this weapon',
      classFloor: 'Reach floor {n} with this class',
    },
    flag: {
      untouchable: 'Reach floor 5 while taking 50 damage or less',
      quickDeath: 'Lose a run in under a minute',
      pistolOnly: 'Reach floor 10 with nothing but the pistol',
      fragileFloor8: 'Reach floor 8 with the Fragile multiplier on',
      allMods: 'Reach floor 5 with every difficulty multiplier on',
      revive5: 'Revive 5 teammates in one run',
      barrels50: 'Blow up 50 barrels in one run',
      hourRun: 'Survive an hour in a single run',
      flawlessBosses: 'Defeat 3 bosses in one run without ever going down',
      cards100: 'Hold 100 cards in a single run',
    },
    classFloor: 'Reach floor {n} with this class',
  },
  tr: {
    title: 'Başarımlar',
    earned: 'kazanıldı',
    hidden: '???',
    hiddenText: 'Gizli bir başarım: nasıl kazanılacağını oynayarak keşfet.',
    done: 'Kazanıldı',
    close: 'Geri',
    runTitle: 'Bu oyunda kazanılan başarımlar',
    stat: {
      kills: 'Toplamda {n} düşman yen',
      runKills: 'Tek bir oyunda {n} düşman yen',
      damage: 'Toplamda {n} hasar ver',
      bosses: 'Toplamda {n} boss yen',
      floor: '{n}. kata ulaş',
      maxHit: 'Tek vuruşta {n} hasar ver',
      crits: 'Toplamda {n} kritik vuruş yap',
      shots: 'Toplamda {n} el ateş et',
      revives: 'Toplamda {n} takım arkadaşını kaldır',
      distance: 'Toplamda {n} metre koş',
      dashes: 'Toplamda {n} kez atıl',
      abilities: 'Sınıf yeteneğini toplamda {n} kez kullan',
      grenades: 'Toplamda {n} bomba at',
      barrels: 'Toplamda {n} varil patlat',
      pickups: 'Toplamda {n} eşya topla',
      healed: 'Toplamda {n} can geri kazan',
      taken: 'Toplamda {n} hasar al',
      games: '{n} oyun oyna',
      seconds: 'Toplamda {n} saniye hayatta kal',
      level: 'Bir oyunda {n}. seviyeye ulaş',
      cards: 'Tek oyunda {n} kart topla',
      modsFloor5: '{n} zorluk çarpanı açıkken 5. kata ulaş',
      score: 'Bir oyunda {n} puan yap',
      weapon: 'Bu silahla {n} düşman yen',
      classFloor: 'Bu sınıfla {n}. kata ulaş',
    },
    flag: {
      untouchable: '50 ya da daha az hasar alarak 5. kata ulaş',
      quickDeath: 'Bir oyunu bir dakikadan kısa sürede kaybet',
      pistolOnly: 'Yalnızca tabancayla 10. kata ulaş',
      fragileFloor8: 'Kırılgan çarpanı açıkken 8. kata ulaş',
      allMods: 'Bütün zorluk çarpanları açıkken 5. kata ulaş',
      revive5: 'Tek oyunda 5 takım arkadaşını kaldır',
      barrels50: 'Tek oyunda 50 varil patlat',
      hourRun: 'Tek oyunda bir saat hayatta kal',
      flawlessBosses: 'Hiç yere düşmeden tek oyunda 3 boss yen',
      cards100: 'Tek oyunda 100 kart topla',
    },
    classFloor: 'Bu sınıfla {n}. kata ulaş',
  },
};

export const achWords = (lang: Lang): Words => W[lang] ?? W.en!;

/** The sentence that says how to get an achievement. */
export function howTo(def: AchievementDef, lang: Lang): string {
  const w = achWords(lang);
  if (def.kind === 'flag') return w.flag[def.stat] ?? '';
  const group = def.stat.startsWith('wk:') ? 'weapon' : def.stat.startsWith('floor:') ? 'classFloor' : def.stat;
  const text = w.stat[group] ?? '';
  const n = def.stat === 'seconds' ? fmtNum(def.target, lang) : fmtNum(def.target, lang);
  return text.replace('{n}', n);
}

export const achName = (def: AchievementDef, lang: Lang): string => (lang === 'tr' ? def.name.tr : def.name.en);
export const achIcon = (def: AchievementDef): string => asset(`ach/${def.id}.webp`);
export const lockedIcon = (): string => asset('ach/locked.webp');
