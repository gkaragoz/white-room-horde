import type { Skill, SkillProfile } from './types';

/**
 * The skill ladder. Superhuman reacts in a tick, aims almost perfectly and decides every tick; Easy is slow, sloppy and forgetful.
 * (The numbers are a first guess: the benchmark in tests/bench.test.ts is what they are tuned against.)
 */
export const SKILL_PROFILES: Readonly<Record<Skill, SkillProfile>> = {
  easy: { reactionTicks: 12, aimError: 0.16, decisionEvery: 6, dodge: 0.25, judgement: 0.3 },
  normal: { reactionTicks: 7, aimError: 0.08, decisionEvery: 4, dodge: 0.55, judgement: 0.6 },
  expert: { reactionTicks: 3, aimError: 0.03, decisionEvery: 2, dodge: 0.85, judgement: 0.9 },
  superhuman: { reactionTicks: 1, aimError: 0.004, decisionEvery: 1, dodge: 1, judgement: 1 },
};

/** The profile of a skill. */
export const profileOf = (skill: Skill): SkillProfile => SKILL_PROFILES[skill];

/** A small deterministic generator (mulberry32) for a bot's own randomness. */
export function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normal-ish random number (sum of three uniforms, scaled to a standard deviation of 1). */
export function gauss(rand: () => number): number {
  return (rand() + rand() + rand() - 1.5) * 2;
}
