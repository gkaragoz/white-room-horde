import { writeFileSync } from 'node:fs';
import { MAX_LEVEL } from '@wrh/shared';
import { createGame, step } from '@wrh/sim';
import { describe, it } from 'vitest';
import { Squad, botLoadouts, type Skill } from '../src';
import { chooseShot } from '../src/aiming';
import { geoOf, segmentCovered } from '../src/geometry';
import { perceive } from '../src/perception';
import { profileOf } from '../src/skill';
import { engagement } from '../src/weapons';

/** Why does the bot not shoot at a given moment? Skipped unless DBG2=1. */
describe.skipIf(process.env.DBG2 !== '1')('dbg2', () => {
  it('prints', () => {
    const seed = Number(process.env.SEED ?? 2000);
    const at = Number(process.env.AT ?? 10500);
    const skill = (process.env.SKILL ?? 'superhuman') as Skill;
    const loads = botLoadouts([0], 1, seed);
    const w = createGame({ seed, level: MAX_LEVEL, map: 0, mods: 0, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
    const squad = new Squad([0], skill, seed);
    const lines: string[] = [];
    while (!w.gameOver && w.tick < at + 3) {
      const inputs = [];
      for (const [slot, input] of squad.inputs(w)) inputs[slot] = input;
      if (w.tick >= at) {
        const mem = {};
        const p = perceive(w, 0, mem);
        const ctx = { skill: profileOf(skill), rand: Math.random, mem };
        const prof = engagement(p);
        const g = geoOf(w.map, p.layer);
        const sh = chooseShot(p, ctx, prof);
        lines.push(`t${w.tick} map ${w.map} pos ${p.x.toFixed(1)},${p.y.toFixed(1)} weapon ${prof.id} range ${prof.range} mag ${p.mag} btn ${inputs[0]!.buttons} shot idx ${sh.index} clear ${sh.clear} barrel ${sh.barrel}`);
        for (const e of p.enemies.slice(0, 6)) lines.push(`   enemy type ${e.type} boss ${e.boss} elite ${e.elite} at (${e.x.toFixed(1)},${e.y.toFixed(1)}) d ${Math.sqrt(e.d2).toFixed(1)} layer ${e.layer} hp ${e.hp.toFixed(0)} covered ${segmentCovered(g, p.x, p.y, e.x, e.y)}`);
      }
      step(w, inputs);
    }
    writeFileSync(process.env.DBG_OUT ?? 'dbg2.txt', lines.join('\n'));
  });
});
