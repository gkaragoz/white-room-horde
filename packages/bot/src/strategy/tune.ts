/**
 * Knobs of the build scorer. The values are what the focused evaluation (tests/evalbuild.test.ts) settled on; the evaluation
 * can override them for an experiment with a string like "xp=1.2,def=0.9" (applyTune).
 */
export const TUNE = {
  /** Value of experience (more cards later). */
  xp: 0.6,
  /** Multipliers of the parts of build power. */
  off: 1,
  def: 1,
  mob: 1,
  ab: 1,
  util: 1,
  /** Multiplier of cards with their own rules (drone, arsenal, shock...). */
  special: 1,
  /** Multiplier of a squad heal and immediate healing. */
  heal: 1,
};

export type TuneKey = keyof typeof TUNE;

/** Set knobs from "key=value,key=value". Unknown keys are ignored. */
export function applyTune(spec: string | undefined): void {
  if (!spec) return;
  for (const part of spec.split(',')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined && k in TUNE && Number.isFinite(Number(v))) (TUNE as Record<string, number>)[k] = Number(v);
  }
}
