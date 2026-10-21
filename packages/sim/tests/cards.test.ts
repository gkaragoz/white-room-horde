import { BALANCE, Buttons, CLASS_CARDS, RANGED_MASK, CARD_CLASS, CARD_IDS, FloorPhase, MISC, UNIVERSAL_CARDS, CARD_RARITY, ENEMY_TYPES, PERSONAL_CARDS, PickupType, PlayerState, RARITY_WEIGHT, TEAM_CARDS, WEAPON_IDS, type CardId, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '../src';
import { dropLoot, spawnPickup } from '../src/pickups';
import { awardXp, xpForNext } from '../src/progression';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const CARD_BUTTON = [Buttons.Card1, Buttons.Card2, Buttons.Card3];

function quiet(seed: number): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  // offers only open when the floor is cleared
  w.misc[MISC.Phase] = FloorPhase.Cleared;
  w.misc[MISC.PhaseEnd] = 1e9;
  return w;
}

/** Put exactly this card first in a character's own offer and have that character take it. */
function pick(w: World, id: CardId, by = 0): void {
  for (let i = 0; i < 3; i++) w.pOffer[by * 3 + i] = -1;
  w.pOffer[by * 3] = CARD_IDS.indexOf(id);
  w.pOffer[by * 3 + 1] = CARD_IDS.indexOf('damage');
  w.pOffer[by * 3 + 2] = CARD_IDS.indexOf('rate');
  w.pCardTimer[by] = 100;
  w.pCardPrev[by] = 0; // a fresh press
  const inputs: PlayerInput[] = [];
  for (let s = 0; s < 4; s++) inputs[s] = s === by ? { ...NONE, buttons: CARD_BUTTON[0]! } : NONE;
  step(w, inputs);
}

const offerOf = (w: World, s: number): number[] => [0, 1, 2].map((i) => w.pOffer[s * 3 + i]!);

describe('card pool', () => {
  it('has 176 cards (36 old, 50 universal, 90 class), every one with a rarity, unique ids and a consistent team / personal split', () => {
    expect(CARD_IDS.length).toBe(36 + UNIVERSAL_CARDS.length + CLASS_CARDS.length);
    expect(UNIVERSAL_CARDS.length).toBe(50);
    expect(CLASS_CARDS.length).toBe(90);
    expect(new Set(CARD_IDS).size).toBe(CARD_IDS.length);
    for (const id of CARD_IDS) expect([0, 1, 2]).toContain(CARD_RARITY[id]);
    for (const p of PERSONAL_CARDS) expect(CARD_IDS).toContain(p);
    for (const t of TEAM_CARDS) expect(CARD_IDS).toContain(t);
    // every card is exactly one of the two: nothing is chosen for the team except the four gifts to everybody
    expect([...TEAM_CARDS].sort()).toEqual(['grenades', 'heal', 'luck']);
    expect(PERSONAL_CARDS.length + TEAM_CARDS.length).toBe(CARD_IDS.length);
    for (const id of Object.keys(CARD_RARITY)) expect(CARD_IDS).toContain(id);
    const universal = [...UNIVERSAL_CARDS, ...CLASS_CARDS].map((u) => u.id as string);
    const perkCards = ['regen', 'thorns', 'shock', 'volatile', 'frost', 'scavenger', 'adrenaline', 'barrier', 'secondwind', 'rage', 'drone'];
    for (const id of CARD_IDS) expect(BALANCE.progression.cards).toHaveProperty(id === 'arsenal' || id === 'heal' || id === 'ammo' || perkCards.includes(id) || universal.includes(id) ? 'damage' : id);
  });

  it('offers three different cards and favours common over rare over epic', () => {
    const count = new Array<number>(CARD_IDS.length).fill(0);
    const w = quiet(5);
    addPlayer(w, 0, 0, 0);
    for (let n = 0; n < 4000; n++) {
      for (let i = 0; i < 3; i++) w.pOffer[i] = -1;
      w.pPending[0] = 0;
      w.pLevel[0] = 1;
      w.pXp[0] = 0;
      awardXp(w, 0, xpForNext(w, 0));
      const offer = offerOf(w, 0);
      expect(new Set(offer).size).toBe(3);
      for (const c of offer) count[c]!++;
    }
    const byRarity = [0, 0, 0];
    const members = [0, 0, 0];
    CARD_IDS.forEach((id, i) => {
      if (((CARD_CLASS[id] >> 0) & 1) === 0) return; // the player is a soldier: other classes' cards are never offered
      byRarity[CARD_RARITY[id]]! += count[i]!;
      members[CARD_RARITY[id]]!++;
    });
    const avg = byRarity.map((c, r) => c / members[r]!);
    expect(avg[0]!).toBeGreaterThan(avg[1]! * 1.4);
    expect(avg[1]!).toBeGreaterThan(avg[2]! * 1.8);
    for (let i = 0; i < CARD_IDS.length; i++) {
      if (((CARD_CLASS[CARD_IDS[i]!] >> 0) & 1) === 0) expect(count[i], CARD_IDS[i]).toBe(0);
      else expect(count[i], CARD_IDS[i]).toBeGreaterThan(0);
    }
    expect(RARITY_WEIGHT.length).toBe(3);
  });
});

describe('every card does what it says, for the character that picked it', () => {
  const c = BALANCE.progression.cards;
  /** Personal cards: [picker, other]. */
  const cases: [CardId, (w: World, before: Record<string, number>) => void][] = [
    ['damage', (w) => expect([w.modDamage[0], w.modDamage[1]]).toEqual([1 + c.damage, 1])],
    ['rate', (w) => expect([w.modRate[0], w.modRate[1]]).toEqual([1 + c.rate, 1])],
    ['speed', (w) => expect([w.modSpeed[0], w.modSpeed[1]]).toEqual([1 + c.speed, 1])],
    ['hp', (w) => expect([w.pMaxHp[0], w.pMaxHp[1]]).toEqual([BALANCE.player.hp + c.hp, BALANCE.player.hp])],
    ['pierce', (w) => expect([w.modPierce[0], w.modPierce[1]]).toEqual([c.pierce, 0])],
    ['arsenal', (w) => expect([WEAPON_IDS[w.pWeapon[0]!], WEAPON_IDS[w.pWeapon[1]!]]).toEqual(['mp', 'pistol'])],
    ['medic', (w) => expect([w.modRevive[0]!, w.modRevive[1]!]).toEqual([c.medic, 1])],
    ['magnet', (w) => expect([w.modMagnet[0]!, w.modMagnet[1]!]).toEqual([c.magnet, 1])],
    ['scholar', (w) => expect([w.modXp[0]!, w.modXp[1]!]).toEqual([c.scholar, 1])],
    ['blast', (w) => expect([w.modBlast[0]!, w.modBlast[1]!]).toEqual([c.blast, 1])],
    ['quickhands', (w) => expect([w.modReload[0]!, w.modReload[1]!]).toEqual([c.quickhands, 1])],
    ['roll', (w) => expect([w.modDash[0]!, w.modDash[1]!]).toEqual([c.roll, 1])],
    ['armor', (w) => expect([w.modArmor[0]!, w.modArmor[1]!]).toEqual([c.armor, 1])],
    ['crit', (w) => expect([w.modCrit[0]!, w.modCrit[1]!]).toEqual([c.crit, 0])],
    ['sharp', (w) => expect([w.pModDmg[0], w.pModDmg[1]]).toEqual([1 + c.sharp, 1])],
    ['sprint', (w) => expect([w.pModSpeed[0], w.pModSpeed[1]]).toEqual([1 + c.sprint, 1])],
    ['bulk', (w) => expect([w.pMaxHp[0], w.pMaxHp[1]]).toEqual([BALANCE.player.hp + c.bulk, BALANCE.player.hp])],
    ['vampire', (w) => expect([w.pLifesteal[0], w.pLifesteal[1]]).toEqual([c.vampire, 0])],
    ['tempo', (w) => expect([w.pModRate[0], w.pModRate[1]]).toEqual([1 + c.tempo, 1])],
    ['marksman', (w) => expect([w.pModPierce[0], w.pModPierce[1]]).toEqual([c.marksman, 0])],
    ['ironskin', (w) => expect([w.pModArmor[0], w.pModArmor[1]]).toEqual([c.ironskin, 1])],
  ];
  for (const [id, check] of cases) {
    it(id, () => {
      const w = quiet(10);
      addPlayer(w, 0, 0, 0, 'pistol');
      addPlayer(w, 1, 5, 0, 'pistol');
      const before = { gren: w.pGren[0]! };
      pick(w, id);
      expect(w.events.some((e) => e.type === 'cardPicked' && e.by === 0), 'card was taken').toBe(true);
      check(w, before);
    });
  }

  it('the team cards help everybody: heal and grenades reach both players, luck is the squad\'s', () => {
    const w = quiet(12);
    addPlayer(w, 0, 0, 0, 'smg');
    addPlayer(w, 1, 5, 0, 'smg');
    w.pHp[0] = 10;
    w.pHp[1] = 20;
    pick(w, 'heal');
    expect([w.pHp[0], w.pHp[1]]).toEqual([w.pMaxHp[0], w.pMaxHp[1]]);
    const g = [w.pGren[0]!, w.pGren[1]!];
    pick(w, 'grenades');
    expect([w.pGren[0], w.pGren[1]]).toEqual([g[0]! + c.grenades, g[1]! + c.grenades]);
    pick(w, 'luck');
    expect(w.modLoot).toBeCloseTo(c.luck);
    // and the event names who took it
    pick(w, 'heal', 1);
    expect(w.events.find((e) => e.type === 'cardPicked')).toMatchObject({ card: CARD_IDS.indexOf('heal'), by: 1 });
  });

  it('multiplier cards stop at their limits', () => {
    const w = quiet(11);
    addPlayer(w, 0, 0, 0);
    for (let i = 0; i < 20; i++) {
      for (const id of ['medic', 'magnet', 'luck', 'blast', 'quickhands', 'roll', 'armor', 'crit', 'ironskin'] as CardId[]) pick(w, id);
    }
    expect(w.modRevive[0]).toBeCloseTo(c.medicMin);
    expect(w.modMagnet[0]).toBeCloseTo(c.magnetMax);
    expect(w.modLoot).toBeCloseTo(c.luckMax);
    expect(w.modBlast[0]).toBeCloseTo(c.blastMax);
    expect(w.modReload[0]).toBeCloseTo(c.quickMin);
    expect(w.modDash[0]).toBeCloseTo(c.rollMin);
    expect(w.modArmor[0]).toBeCloseTo(c.armorMin);
    expect(w.modCrit[0]).toBeCloseTo(c.critMax);
    expect(w.pModArmor[0]).toBeCloseTo(c.ironMin);
  });
});

describe('every character levels on its own', () => {
  it('a kill gives xp to the killer only, and only the killer can level up from it', () => {
    const w = quiet(30);
    addPlayer(w, 0, -10, 0, 'pistol');
    addPlayer(w, 1, 10, 0, 'pistol');
    const k = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 14, 0, false);
    w.eHp[k] = 1;
    w.eCooldown[k] = 1e9;
    for (let t = 0; t < 40 && w.kills === 0; t++) step(w, [NONE, { ...NONE, buttons: Buttons.Fire }]);
    expect(w.kills).toBe(1);
    expect(w.pXp[1]).toBeGreaterThan(0);
    expect(w.pXp[0]).toBe(0);
    // enough xp for a level goes to player 1 only
    awardXp(w, 1, xpForNext(w, 1));
    expect([w.pLevel[0], w.pLevel[1]]).toEqual([1, 2]);
    expect(offerOf(w, 0)).toEqual([-1, -1, -1]);
    expect(offerOf(w, 1).every((c) => c >= 0)).toBe(true);
    expect(w.events.some((e) => e.type === 'levelUp' && e.slot === 1 && e.level === 2)).toBe(true);
  });

  it('two characters can have their own offers open at once; one pick never touches the other\'s', () => {
    const w = quiet(31);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 5, 0);
    awardXp(w, 0, xpForNext(w, 0));
    awardXp(w, 1, xpForNext(w, 1));
    const second = offerOf(w, 1);
    expect(offerOf(w, 0).every((c) => c >= 0)).toBe(true);
    expect(second.every((c) => c >= 0)).toBe(true);
    // player 0 takes the second card of THEIR offer; player 1's offer is still open and unchanged
    step(w, [{ ...NONE, buttons: Buttons.Card2 }, NONE]);
    expect(offerOf(w, 0)).toEqual([-1, -1, -1]);
    expect(offerOf(w, 1)).toEqual(second);
    // player 1 pressing Card3 takes the third card of theirs, not of player 0's
    step(w, [NONE, { ...NONE, buttons: Buttons.Card3 }]);
    expect(offerOf(w, 1)).toEqual([-1, -1, -1]);
    const picked = w.events.filter((e) => e.type === 'cardPicked');
    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatchObject({ card: second[2], by: 1 });
  });

  it('a character who does not choose gets a random card of their own when their time runs out; a downed one keeps waiting', () => {
    const w = quiet(32);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 5, 0);
    awardXp(w, 0, xpForNext(w, 0));
    awardXp(w, 1, xpForNext(w, 1));
    w.pState[1] = PlayerState.Downed;
    w.pHp[1] = 0;
    const waiting = offerOf(w, 1);
    for (let t = 0; t < BALANCE.progression.cardSeconds * 30 + 5; t++) step(w, [NONE, NONE]);
    expect(offerOf(w, 0)).toEqual([-1, -1, -1]);
    expect(offerOf(w, 1)).toEqual(waiting);
  });

  it('levels queue up per character and open one offer after the other', () => {
    const w = quiet(33);
    addPlayer(w, 0, 0, 0);
    awardXp(w, 0, xpForNext(w, 0) * 3);
    expect(w.pLevel[0]!).toBeGreaterThanOrEqual(3);
    expect(w.pPending[0]!).toBeGreaterThanOrEqual(1);
    const levels = w.pLevel[0]!;
    step(w, [{ ...NONE, buttons: Buttons.Card1 }]);
    expect(offerOf(w, 0).every((x) => x < 0)).toBe(true); // picked; the next one waits out the pick lock
    for (let t = 0; t < 4; t++) step(w, [{ ...NONE, buttons: Buttons.Card1 }]); // a key still held does not pick for the next offer
    expect(offerOf(w, 0).every((x) => x < 0)).toBe(true);
    for (let t = 0; t < 12; t++) step(w, [NONE]);
    expect(offerOf(w, 0).every((x) => x >= 0)).toBe(true); // the next one opened
    expect(w.pLevel[0]).toBe(levels);
    expect(w.pCardTimer[0]).toBeGreaterThan(BALANCE.progression.cardSeconds * 30 - 15); // its clock only started when it opened
  });

  it('digits choose cards while the character has an offer, and pick weapons otherwise', () => {
    const w = quiet(34);
    addPlayer(w, 0, 0, 0, 'ar');
    awardXp(w, 0, xpForNext(w, 0));
    const before = w.pWeapon[0];
    step(w, [{ ...NONE, wsel: 1 }]); // would be the pistol, but the offer is open
    expect(w.pWeapon[0]).toBe(before);
  });
});

describe('card effects in play', () => {
  it('armor and ironskin reduce the damage a player takes', () => {
    const hit = (setup: (w: World) => void): number => {
      const w = quiet(20);
      addPlayer(w, 0, 0, 0);
      setup(w);
      const k = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 0.8, 0, false);
      w.eCooldown[k] = 0;
      for (let t = 0; t < 12; t++) step(w, [NONE]);
      return BALANCE.player.hp - w.pHp[0]!;
    };
    const base = hit(() => undefined);
    expect(hit((w) => (w.modArmor[0] = 0.5))).toBeCloseTo(base * 0.5, 5);
    expect(hit((w) => (w.pModArmor[0] = 0.5))).toBeCloseTo(base * 0.5, 5);
  });

  it('crit doubles some bullets; vampire heals on a kill; scholar gives more xp', () => {
    const damages = (crit: number): number[] => {
      const w = quiet(21);
      addPlayer(w, 0, 0, 0, 'ar');
      w.modCrit[0] = crit;
      const seen: number[] = [];
      for (let t = 0; t < 60; t++) {
        step(w, [{ ...NONE, buttons: Buttons.Fire }]);
        for (let i = 0; i < w.bActive.length; i++) if (w.bActive[i] && w.bLife[i]! > 0 && !seen.includes(i + w.tick * 4096)) seen.push(w.bDamage[i]!);
      }
      return seen;
    };
    const plain = new Set(damages(0));
    const crit = damages(0.5);
    expect(plain.size).toBe(1);
    expect(new Set(crit).size).toBe(2);
    expect(Math.max(...crit)).toBeCloseTo(BALANCE.weapons.ar.damage * 2);

    const w = quiet(22);
    addPlayer(w, 0, -3, 0, 'ar');
    w.pHp[0] = 50;
    w.pLifesteal[0] = 5;
    const k = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 3, 0, false);
    w.eHp[k] = 1;
    w.eCooldown[k] = 1e9;
    for (let t = 0; t < 30 && w.kills === 0; t++) step(w, [{ ...NONE, buttons: Buttons.Fire }]);
    expect(w.kills).toBe(1);
    expect(w.pHp[0]).toBeGreaterThan(50);

    const a = quiet(23);
    addPlayer(a, 0, 0, 0);
    a.modXp[0] = 2;
    awardXp(a, 0, 10);
    expect(a.pXp[0]).toBe(20);
  });

  it('magnet pulls loot from further away; luck makes drops more common; medic revives faster; blast grows explosions', () => {
    const w = quiet(24);
    addPlayer(w, 0, 0, 0, 'ar');
    w.pGren[0] = 0;
    spawnPickup(w, PickupType.Grenade, BALANCE.pickups.magnetRadius + 1, 0);
    step(w, [NONE]);
    expect(w.kX[0]).toBe(BALANCE.pickups.magnetRadius + 1); // out of the normal pull
    w.modMagnet[0] = 2;
    step(w, [NONE]);
    expect(w.kX[0]!).toBeLessThan(BALANCE.pickups.magnetRadius + 1);

    const drops = (luck: number): number => {
      const x = quiet(25);
      addPlayer(x, 0, -20, 0, 'ar');
      x.modLoot = luck;
      let n = 0;
      for (let i = 0; i < 1500; i++) {
        x.kActive.fill(0);
        dropLoot(x, 10, 10, false);
        if (x.kActive.some((v) => v === 1)) n++;
      }
      return n;
    };
    expect(drops(3)).toBeGreaterThan(drops(1) * 1.8);

    const reviveTicks = (mul: number): number => {
      const x = quiet(26);
      addPlayer(x, 0, 0, 0);
      addPlayer(x, 1, 0.5, 0);
      x.modRevive[1] = mul; // the helper's own medic card
      x.pHp[0] = 0;
      step(x, [NONE, NONE]);
      let t = 0;
      while (x.pState[0] !== 0 && t < 400) {
        step(x, [NONE, { ...NONE, buttons: Buttons.Revive }]);
        t++;
      }
      return t;
    };
    expect(reviveTicks(0.5)).toBeLessThan(reviveTicks(1) * 0.7);

    const blast = (mul: number): number => {
      const x = quiet(27);
      addPlayer(x, 0, 0, 0);
      x.modBlast[0] = mul;
      step(x, [{ ...NONE, buttons: Buttons.Grenade }]);
      let radius = 0;
      for (let t = 0; t < 60 && !radius; t++) {
        step(x, [NONE]);
        for (const e of x.events) if (e.type === 'explosion') radius = e.radius;
      }
      return radius;
    };
    expect(blast(1.5)).toBeCloseTo(blast(1) * 1.5);
    expect(WEAPON_IDS.length).toBeGreaterThan(0);
  });
});

describe('the level queue and the class filter', () => {
  it('levels bank mid-fight and open one offer after the other once the floor is cleared, surviving the climb', () => {
    const w = createWorld(31);
    w.waveTick = 1e9;
    w.countMul = 0;
    addPlayer(w, 0, 0, 0);
    for (let n = 0; n < 3; n++) awardXp(w, 0, xpForNext(w, 0));
    expect(w.pPending[0]).toBe(3);
    for (let t = 0; t < 60; t++) step(w, [NONE]);
    expect(offerOf(w, 0)).toEqual([-1, -1, -1]); // a fight is going on: nothing opens
    w.misc[MISC.Phase] = FloorPhase.Cleared;
    w.misc[MISC.PhaseEnd] = 1e9;
    step(w, [NONE]);
    expect(offerOf(w, 0)[0]).toBeGreaterThanOrEqual(0);
    expect(w.pPending[0]).toBe(2);
    // the climb keeps the queue and the open offer (its clock waits)
    w.misc[MISC.Phase] = FloorPhase.Ascend;
    const timer = w.pCardTimer[0]!;
    for (let t = 0; t < 90; t++) step(w, [NONE]);
    expect(w.pCardTimer[0]).toBe(timer);
    expect(w.pPending[0]).toBe(2);
    // a pick during the climb is allowed; the next offer waits for the next quiet phase
    step(w, [{ ...NONE, buttons: Buttons.Card1 }]);
    for (let t = 0; t < 40; t++) step(w, [NONE]);
    expect(offerOf(w, 0)).toEqual([-1, -1, -1]);
    expect(w.pPending[0]).toBe(2);
    w.misc[MISC.Phase] = FloorPhase.Arrive;
    for (let t = 0; t < 20; t++) step(w, [NONE]);
    expect(offerOf(w, 0)[0]).toBeGreaterThanOrEqual(0);
    expect(w.pPending[0]).toBe(1);
  });

  it('blade and hammer fighters never see the cards that only make sense for guns; shooters never see melee-only ones', () => {
    const onlyGuns = CARD_IDS.filter((id) => CARD_CLASS[id] === RANGED_MASK);
    expect(onlyGuns.length).toBeGreaterThanOrEqual(10);
    for (const cls of [7, 8, 0]) {
      const w = quiet(40 + cls);
      addPlayer(w, 0, 0, 0, cls === 7 ? 'sword' : cls === 8 ? 'hammer' : 'pistol', cls);
      const seen = new Set<number>();
      for (let n = 0; n < 3000; n++) {
        for (let i = 0; i < 3; i++) w.pOffer[i] = -1;
        w.pPending[0] = 0;
        w.pXp[0] = 0;
        awardXp(w, 0, xpForNext(w, 0));
        for (const c of offerOf(w, 0)) seen.add(c);
      }
      for (const id of CARD_IDS) {
        const idx = CARD_IDS.indexOf(id);
        if (cls === 0) expect(seen.has(idx) || ((CARD_CLASS[id] >> 0) & 1) === 0, id).toBe(true);
        else if (CARD_CLASS[id] === RANGED_MASK) expect(seen.has(idx), `${id} for class ${cls}`).toBe(false);
      }
    }
  });

  it('every universal card changes only its owner and stays inside its clamps, however often it is taken', () => {
    for (const card of UNIVERSAL_CARDS) {
      const w = quiet(50);
      addPlayer(w, 0, 0, 0, 'pistol');
      addPlayer(w, 1, 5, 0, 'pistol');
      const other = [w.modDamage[1], w.pModDmg[1], w.pMaxHp[1], w.pModArmor[1], w.modReload[1], w.modDash[1]];
      for (let n = 0; n < 12; n++) pick(w, card.id as CardId);
      expect(w.pMaxHp[0]!, card.id).toBeGreaterThanOrEqual(30);
      expect(w.modArmor[0]! >= 0.4 && w.pModArmor[0]! >= 0.35, card.id).toBe(true);
      expect(w.modReload[0]! >= 0.3 && w.modDash[0]! >= 0.25 && w.modCrit[0]! <= 0.75, card.id).toBe(true);
      expect([w.modDamage[1], w.pModDmg[1], w.pMaxHp[1], w.pModArmor[1], w.modReload[1], w.modDash[1]], card.id).toEqual(other);
    }
  });

  it('the old ammo card is a speed loader now', () => {
    const w = quiet(51);
    addPlayer(w, 0, 0, 0, 'pistol');
    pick(w, 'ammo');
    expect(w.modReload[0]).toBeCloseTo(BALANCE.progression.cards.loader, 9);
  });
});

describe('class cards', () => {
  it('each class has ten of its own, offered only to that class', () => {
    for (let cls = 0; cls < 9; cls++) expect(CLASS_CARDS.filter((c) => c.cls === cls).length).toBe(10);
    for (const cls of [0, 1, 7, 8]) {
      const w = quiet(60 + cls);
      addPlayer(w, 0, 0, 0, cls === 7 ? 'sword' : cls === 8 ? 'hammer' : 'pistol', cls);
      const seen = new Set<number>();
      for (let n = 0; n < 800; n++) {
        for (let i = 0; i < 3; i++) w.pOffer[i] = -1;
        w.pPending[0] = 0;
        w.pXp[0] = 0;
        awardXp(w, 0, xpForNext(w, 0));
        for (const c of offerOf(w, 0)) seen.add(c);
      }
      for (const card of CLASS_CARDS) expect(seen.has(CARD_IDS.indexOf(card.id)), `${card.id} for class ${cls}`).toBe(card.cls === cls);
      expect(CLASS_CARDS.filter((c) => c.cls === cls && seen.has(CARD_IDS.indexOf(c.id))).length).toBe(10);
    }
  });

  it('ability cards change the ability: cooldown, duration, radius, damage, extra shots', () => {
    const w = quiet(70);
    addPlayer(w, 0, 0, 0, 'pistol', 5); // ranger
    pick(w, 'quickdraw');
    pick(w, 'bigquiver');
    pick(w, 'heavybolts');
    expect(w.modAbCd[0]).toBeCloseTo(0.8, 9);
    expect(w.modAbExtra[0]).toBe(2);
    expect(w.modAbDmg[0]).toBeCloseTo(1.3, 9);
    // the ability uses them: cooldown shorter, more shots
    step(w, [{ ...NONE, buttons: Buttons.Special }]);
    expect(w.pOver[0]).toBe(BALANCE.abilities.ranger!.shots! + 2);
    expect(w.pSpecCd[0]).toBeCloseTo(BALANCE.abilities.ranger!.cd! * 0.8, 1);
    // the other player is untouched
    const o = quiet(71);
    addPlayer(o, 0, 0, 0, 'pistol', 5);
    expect([o.modAbCd[0], o.modAbExtra[0], o.modAbDmg[0], o.modAbRad[0], o.modAbDur[0]]).toEqual([1, 0, 1, 1, 1]);
  });
});
