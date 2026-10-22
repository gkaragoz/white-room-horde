import { CARD_IDS, MAX_LEVEL, type PlayerInput } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { botLoadouts, Squad } from './squad';
import { readSheet } from './strategy/sheet';
import type { Skill } from './types';

/** A fixed-length game for judging build strategies at equal conditions (same seeds, same movement and combat). */
export interface BuildGameOptions {
  seed: number;
  bots: number;
  skill: Skill;
  /** Game length in ticks (the game ends earlier when the squad is wiped). */
  ticks: number;
  /** Keep every bot alive (full health every tick, revived at once): measures how fast a build kills, not how long it lives. */
  god?: boolean;
  level?: number;
  map?: number;
}

export interface BuildGameResult {
  seed: number;
  floor: number;
  ticks: number;
  kills: number;
  alive: number;
  /** Averages over the bots at the end. */
  cardsTaken: number;
  maxHp: number;
  /** Health over the damage-taking factor: how much damage the character takes before it falls. */
  ehp: number;
  /** Damage factor times fire-rate factor. */
  dps: number;
  weapons: number;
  drones: number;
  level: number;
}

export function playBuildGame(o: BuildGameOptions): BuildGameResult {
  const loads = botLoadouts(Array.from({ length: o.bots }, (_, i) => i), o.bots, o.seed);
  const w = createGame({ seed: o.seed, level: o.level ?? MAX_LEVEL, map: o.map ?? 0, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
  const squad = new Squad(loads.map((l) => l.slot), o.skill, o.seed);
  const inputs: (PlayerInput | undefined)[] = [];
  while (!w.gameOver && w.tick < o.ticks) {
    inputs.length = 0;
    for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
    step(w, inputs);
    if (o.god) {
      for (const l of loads) {
        if (w.pState[l.slot] !== 0) w.pState[l.slot] = 0;
        w.pHp[l.slot] = w.pMaxHp[l.slot]!;
      }
      w.gameOver = 0;
    }
  }
  let alive = 0;
  const a = { cards: 0, maxHp: 0, ehp: 0, dps: 0, weapons: 0, drones: 0, level: 0 };
  for (const l of loads) {
    const s = l.slot;
    if (w.pState[s] === 0) alive++;
    const sh = readSheet(w, s);
    let cards = 0;
    for (let c = 0; c < CARD_IDS.length; c++) cards += w.pCards[s * CARD_IDS.length + c]!;
    a.cards += cards;
    a.maxHp += sh.maxHp;
    a.ehp += (sh.maxHp + 1.5 * sh.shield) / (sh.armorA * sh.armorB);
    a.dps += sh.dmgA * sh.dmgB * sh.rateA * sh.rateB * (1 + sh.crit);
    let owned = 0;
    for (let i = 0; i < 25; i++) if ((w.pOwned[s]! >> i) & 1) owned++;
    a.weapons += owned;
    let dr = 0;
    for (let t = 0; t < 7; t++) if (w.pDLv[s * 7 + t]! > 0) dr++;
    a.drones += dr;
    a.level += w.pLevel[s]!;
  }
  const n = Math.max(1, loads.length);
  return { seed: o.seed, floor: w.wave, ticks: w.tick, kills: w.kills, alive, cardsTaken: a.cards / n, maxHp: a.maxHp / n, ehp: a.ehp / n, dps: a.dps / n, weapons: a.weapons / n, drones: a.drones / n, level: a.level / n };
}
