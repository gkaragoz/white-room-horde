import { ACHIEVEMENTS, type AchievementDef } from '@wrh/shared';
import type { RunSummary } from '@wrh/sim';

/** What the game remembers about the achievements: running totals, best runs, when each was earned, which the player has looked at. */
export interface AchStore {
  life: Record<string, number>;
  best: Record<string, number>;
  got: Record<string, number>;
  seen: Record<string, 1>;
}

export const emptyStore = (): AchStore => ({ life: {}, best: {}, got: {}, seen: {} });

/** The value of an achievement now (a running total, a best run, or 0 / 1 for a special condition). */
export function valueOf(def: AchievementDef, store: AchStore): number {
  if (def.kind === 'life') return store.life[def.stat] ?? 0;
  if (def.kind === 'best') return store.best[def.stat] ?? 0;
  return store.got[def.id] ? 1 : 0;
}

export const isGot = (def: AchievementDef, store: AchStore): boolean => !!store.got[def.id];

/** Fold a finished run in; returns the achievements it earned. The store is changed in place. */
export function applyRun(store: AchStore, run: RunSummary, now = Date.now()): AchievementDef[] {
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
  // the hidden special-condition achievements are not given before the tenth run ("That Was Quick" aside: a short run is its point)
  const veteran = (store.life.games ?? 0) >= 10;
  for (const def of ACHIEVEMENTS) {
    if (store.got[def.id]) continue;
    if (def.hidden && def.kind === 'flag' && def.stat !== 'quickDeath' && !veteran) continue;
    const done = def.kind === 'flag' ? run.flags[def.stat] === true : valueOf(def, store) >= def.target;
    if (!done) continue;
    store.got[def.id] = now;
    earned.push(def);
  }
  return earned;
}
