import { CARD_CLASS, CARD_IDS, CLASS_IDS, MELEE_CLASSES, PickupType, WEAPON_IDS } from '@wrh/shared';
import { createGame, giveWeapon, grantDrone, step, type World } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { Bot, Squad, botLoadouts, buildMode, decideBuild, pickCard, pickupScore, pickupWorth, scoreCard, scoreOffer, SKILL_PROFILES } from '../src';
import { classOf, perceive } from '../src/perception';
import { chooseDrone } from '../src/drones';
import { makeRand } from '../src/skill';
import { readSheet } from '../src/strategy/sheet';
import { readContext } from '../src/cardscore';
import { chooseWeapon } from '../src/weaponchoice';
import type { Ctx, Percept, Threat } from '../src/types';

const idx = (id: string): number => CARD_IDS.indexOf(id as (typeof CARD_IDS)[number]);
const clsIdx = (id: string): number => CLASS_IDS.indexOf(id as (typeof CLASS_IDS)[number]);

function ctxOf(skill: keyof typeof SKILL_PROFILES, seed = 1): Ctx {
  return { skill: SKILL_PROFILES[skill], rand: makeRand(seed), mem: {} };
}

function world(cls: string, weapon = 'ar'): World {
  return createGame({ seed: 7, players: [{ slot: 0, weapon: weapon as 'ar', cls: clsIdx(cls) }, { slot: 1, weapon: 'smg', cls: clsIdx('medic') }] });
}

function enemy(id: number, x: number, y: number, over: Partial<Threat> = {}): Threat {
  return { id, x, y, d2: x * x + y * y, type: 0, boss: false, elite: 0, hp: 50, maxHp: 50, vx: 0, vy: 0, layer: 0, ...over };
}

describe('card scoring', () => {
  it('scores every card a class can be offered with a finite number', () => {
    for (let cls = 0; cls < CLASS_IDS.length; cls++) {
      const w = world(CLASS_IDS[cls]!);
      const sheet = readSheet(w, 0);
      const bc = readContext(w, 0, cls);
      for (const id of CARD_IDS) {
        if (((CARD_CLASS[id] >> cls) & 1) === 0) continue;
        const v = scoreCard(sheet, bc, idx(id));
        expect(Number.isFinite(v), `${CLASS_IDS[cls]} ${id}`).toBe(true);
      }
    }
  });

  it('rejects an index that is not a card', () => {
    const w = world('soldier');
    expect(scoreCard(readSheet(w, 0), readContext(w, 0, 0), 9999)).toBeLessThan(-1e8);
    expect(scoreCard(readSheet(w, 0), readContext(w, 0, 0), -1)).toBeLessThan(-1e8);
  });

  it('prefers toughness for a tank and a bigger blast for a demolisher', () => {
    const wh = world('heavy');
    const sh = readSheet(wh, 0);
    const bh = readContext(wh, 0, clsIdx('heavy'));
    expect(scoreCard(sh, bh, idx('tank'))).toBeGreaterThan(scoreCard(sh, bh, idx('glasscannon')));
    expect(scoreCard(sh, bh, idx('juggernaut'))).toBeGreaterThan(scoreCard(sh, bh, idx('luckypenny')));
    const wd = world('demolisher', 'shotgun');
    const sd = readSheet(wd, 0);
    const bd = readContext(wd, 0, clsIdx('demolisher'));
    expect(scoreCard(sd, bd, idx('demoexpert'))).toBeGreaterThan(scoreCard(sd, bd, idx('luckypenny')));
  });

  it('values a heal by how hurt the character is', () => {
    const w = world('soldier');
    const sheet = readSheet(w, 0);
    const bc = readContext(w, 0, 0);
    const full = scoreCard(sheet, bc, idx('snack'));
    w.pHp[0] = 20;
    const hurt = scoreCard(readSheet(w, 0), readContext(w, 0, 0), idx('snack'));
    expect(hurt).toBeGreaterThan(full + 0.1);
  });

  it('gives a capped stat no more value (diminishing returns)', () => {
    const w = world('ranger');
    const before = scoreCard(readSheet(w, 0), readContext(w, 0, 5), idx('crit'));
    w.modCrit[0] = 0.5;
    const capped = scoreCard(readSheet(w, 0), readContext(w, 0, 5), idx('crit'));
    expect(before).toBeGreaterThan(0.02);
    expect(capped).toBeLessThan(before * 0.2);
  });

  it('does not value a one-time card twice', () => {
    const w = world('soldier');
    const first = scoreCard(readSheet(w, 0), readContext(w, 0, 0), idx('shock'));
    w.pCards[idx('shock')] = 1;
    const again = scoreCard(readSheet(w, 0), readContext(w, 0, 0), idx('shock'));
    expect(first).toBeGreaterThan(0.05);
    expect(again).toBeLessThan(first * 0.2);
  });

  it('picks the best card at superhuman and sometimes a worse one at easy', () => {
    const scores = [0.1, 0.5, 0.2];
    const rand = makeRand(3);
    for (let i = 0; i < 50; i++) expect(pickCard(scores, 1, rand)).toBe(1);
    let off = 0;
    for (let i = 0; i < 200; i++) if (pickCard(scores, SKILL_PROFILES.easy.judgement, rand) !== 1) off++;
    expect(off).toBeGreaterThan(20);
    let offExpert = 0;
    for (let i = 0; i < 200; i++) if (pickCard(scores, SKILL_PROFILES.expert.judgement, rand) !== 1) offExpert++;
    expect(offExpert).toBeLessThan(off / 2);
  });

  it('handles an empty offer and offers of unknown cards', () => {
    expect(pickCard([], 1, makeRand(1))).toBe(-1);
    expect(pickCard([-1e9, -1e9], 1, makeRand(1))).toBe(-1);
    const w = world('soldier');
    expect(scoreOffer(w, 0, 0, [])).toEqual([]);
    expect(pickCard(scoreOffer(w, 0, 0, [99999]), 1, makeRand(1))).toBe(-1);
  });
});

describe('decideBuild', () => {
  it('never presses a card button when no offer is pending', () => {
    const w = world('soldier');
    const ctx = ctxOf('superhuman');
    for (let t = 0; t < 120; t++) {
      const p = perceive(w, 0, ctx.mem);
      expect(p.offer).toHaveLength(0);
      expect(decideBuild(p, ctx).card).toBe(0);
      step(w, [undefined, undefined]);
    }
  });

  it('picks a position that is in the offer, releases the button between presses, and ignores a downed character', () => {
    const w = world('soldier');
    const ctx = ctxOf('superhuman');
    const offer = [idx('damage'), idx('juggernaut'), idx('luck')];
    for (let i = 0; i < 3; i++) w.pOffer[i] = offer[i]!;
    const seen: number[] = [];
    for (let t = 0; t < 6; t++) {
      const p: Percept = perceive(w, 0, ctx.mem);
      seen.push(decideBuild(p, ctx).card);
    }
    expect(seen[0]).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBeLessThanOrEqual(3);
    expect(seen[1]).toBe(0);
    expect(seen[2]).toBe(seen[0]);
    w.pState[0] = 1;
    const down = decideBuild(perceive(w, 0, ctx.mem), ctx);
    expect(down.card).toBe(0);
  });

  it('takes the cards that are offered during a game, quickly, at every skill', { timeout: 300_000 }, () => {
    for (const skill of ['normal', 'expert', 'superhuman'] as const) {
      buildMode.baseline = false;
      const loads = botLoadouts([0, 1], 2, 5);
      const w = createGame({ seed: 5, players: loads.map((l) => ({ slot: l.slot, weapon: l.weapon, cls: l.cls })) });
      const squad = new Squad([0, 1], skill, 5);
      let offers = 0;
      let slow = 0;
      const opened = new Map<number, number>();
      for (let t = 0; t < 30 * 240 && !w.gameOver; t++) {
        const inputs = squad.inputs(w);
        for (const s of [0, 1]) {
          const has = w.pOffer[s * 3]! >= 0;
          if (has && !opened.has(s)) {
            opened.set(s, w.tick);
            offers++;
          }
          if (!has && opened.has(s)) {
            if (w.tick - opened.get(s)! > 40) slow++;
            opened.delete(s);
          }
        }
        step(w, [inputs.get(0), inputs.get(1)]);
        // keep the squad on its feet so the offers of a long game can be watched
        for (const s of [0, 1]) {
          w.pState[s] = 0;
          w.pHp[s] = w.pMaxHp[s]!;
        }
        w.gameOver = 0;
      }
      expect(offers, skill).toBeGreaterThan(1);
      expect(slow, skill).toBe(0);
    }
  });
});

describe('weapon choice', () => {
  const NOMEM = (): Record<string, unknown> => ({});

  it('keeps the weapon of a melee class and of a character with one weapon', () => {
    const wm = world('swordsman');
    const pm = perceive(wm, 0, {});
    expect(chooseWeapon(pm, NOMEM(), readSheet(wm, 0), 1, makeRand(1), classOf(wm, 0))).toBe(0);
    expect(MELEE_CLASSES).toContain(clsIdx('swordsman'));
    const w1 = createGame({ seed: 1, players: [{ slot: 0, weapon: 'ar', cls: 0 }] });
    w1.pOwned[0] = 1 << WEAPON_IDS.indexOf('ar');
    expect(chooseWeapon(perceive(w1, 0, {}), NOMEM(), readSheet(w1, 0), 1, makeRand(1), 0)).toBe(0);
  });

  it('swaps to a rocket launcher over a pistol in a crowd, and never to a weapon it does not own', () => {
    const w = createGame({ seed: 1, players: [{ slot: 0, weapon: 'pistol', cls: 0 }] });
    giveWeapon(w, 0, WEAPON_IDS.indexOf('rocket'));
    const p = perceive(w, 0, {});
    p.enemies = [enemy(1, 6, 0), enemy(2, 7, 1), enemy(3, 7, -1), enemy(4, 8, 0), enemy(5, 8, 2)];
    p.tick = 200;
    const pick = chooseWeapon(p, { weapon: { since: 0, held: p.weapon } }, readSheet(w, 0), 1, makeRand(1), 0);
    expect(pick).toBe(WEAPON_IDS.indexOf('rocket') + 1);
    // the choice is always something that is owned
    for (const name of WEAPON_IDS) {
      const wsel = chooseWeapon({ ...p, enemies: [enemy(1, 3, 0)] }, NOMEM(), readSheet(w, 0), 0.3, makeRand(9), 0);
      if (wsel > 0) expect(((w.pOwned[0]! >> (wsel - 1)) & 1) === 1, name).toBe(true);
    }
  });

  it('does not flicker: a new weapon is held for a while even when another looks better', () => {
    const w = createGame({ seed: 1, players: [{ slot: 0, weapon: 'pistol', cls: 0 }] });
    giveWeapon(w, 0, WEAPON_IDS.indexOf('rocket'));
    const mem: Record<string, unknown> = {};
    const p = perceive(w, 0, {});
    p.enemies = [enemy(1, 6, 0), enemy(2, 7, 1), enemy(3, 7, -1), enemy(4, 8, 0)];
    p.tick = 10;
    // just switched to the pistol (the memory sees a weapon it has not held before): no swap yet
    expect(chooseWeapon(p, mem, readSheet(w, 0), 1, makeRand(1), 0)).toBe(0);
    p.tick = 40;
    expect(chooseWeapon(p, mem, readSheet(w, 0), 1, makeRand(1), 0)).toBe(0);
    p.tick = 100;
    expect(chooseWeapon(p, mem, readSheet(w, 0), 1, makeRand(1), 0)).toBe(WEAPON_IDS.indexOf('rocket') + 1);
  });
});

describe('drone choice', () => {
  it('turns to the healer when the squad is hurt, and keeps a drone for a while otherwise', () => {
    const w = world('soldier');
    grantDrone(w, 0, 3);
    grantDrone(w, 0, 0);
    w.pDLv[0] = 25;
    expect(w.pDrone[0]).toBe(4);
    w.pHp[0] = 30;
    w.pHp[1] = 20;
    const mem: Record<string, unknown> = { drone: { since: 0, active: 3, evalAt: -1e9 } };
    const p = perceive(w, 0, {});
    p.tick = 1000;
    p.enemies = [];
    const choice = chooseDrone(p, mem, readSheet(w, 0), 1, makeRand(1));
    expect(choice).toBe(1);
    // right after a swap the commitment holds
    w.pDrone[0] = 1;
    const p2 = { ...perceive(w, 0, {}), tick: 1010, enemies: [enemy(1, 4, 0), enemy(2, 5, 0), enemy(3, 6, 1), enemy(4, 5, 2)] };
    w.pHp[0] = w.pMaxHp[0]!;
    w.pHp[1] = w.pMaxHp[1]!;
    expect(chooseDrone(p2, mem, readSheet(w, 0), 1, makeRand(1))).toBe(0);
  });

  it('does nothing without drones', () => {
    const w = world('soldier');
    expect(chooseDrone(perceive(w, 0, {}), {}, readSheet(w, 0), 1, makeRand(1))).toBe(0);
  });
});

describe('pickup value', () => {
  it('wants health only when hurt, and weapons only when they are new and the class uses guns', () => {
    const w = world('soldier');
    const p = perceive(w, 0, {});
    const health = { id: 0, x: p.x + 5, y: p.y, type: PickupType.Health, data: 0 };
    expect(pickupWorth(p, health)).toBe(0);
    w.pHp[0] = 30;
    const hurt = perceive(w, 0, {});
    expect(pickupWorth(hurt, health)).toBeGreaterThan(20);
    const rocket = { id: 1, x: p.x + 5, y: p.y, type: PickupType.Weapon, data: WEAPON_IDS.indexOf('rocket') };
    expect(pickupWorth(p, rocket)).toBeGreaterThan(8);
    const owned = { ...rocket, data: WEAPON_IDS.indexOf('ar') };
    expect(pickupWorth(p, owned)).toBe(0);
    const wm = world('hammerer');
    expect(pickupWorth(perceive(wm, 0, {}), rocket)).toBe(0);
  });

  it('subtracts the walk', () => {
    const w = world('soldier');
    w.pHp[0] = 40;
    const p = perceive(w, 0, {});
    const near = { id: 0, x: p.x + 3, y: p.y, type: PickupType.Health, data: 0 };
    const far = { id: 0, x: p.x + 80, y: p.y, type: PickupType.Health, data: 0 };
    expect(pickupScore(p, near)).toBeGreaterThan(0);
    expect(pickupScore(p, far)).toBeLessThan(0);
  });
});

describe('a bot with the build strategy', () => {
  it('is deterministic for the same seed', () => {
    const run = (): string => {
      buildMode.baseline = false;
      const w = createGame({ seed: 11, players: [{ slot: 0, weapon: 'ar', cls: 0 }] });
      const bot = new Bot({ slot: 0, skill: 'expert', seed: 11 });
      const out: string[] = [];
      for (let t = 0; t < 600; t++) {
        const i = bot.input(w);
        out.push(JSON.stringify(i));
        step(w, [i]);
      }
      return out.join('|');
    };
    expect(run()).toEqual(run());
  });
});
