import { BALANCE, Buttons, CARD_IDS, CARD_RARITY, ENEMY_TYPES, PERSONAL_CARDS, PickupType, RARITY_WEIGHT, WEAPON_IDS, type CardId, type PlayerInput } from '@wrh/shared';
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
  return w;
}

/** Offer exactly this card (first slot) and have the given player take it. */
function pick(w: World, id: CardId, by = 0): void {
  w.cardOffer.fill(-1);
  w.cardOffer[0] = CARD_IDS.indexOf(id);
  w.cardOffer[1] = CARD_IDS.indexOf('damage');
  w.cardOffer[2] = CARD_IDS.indexOf('rate');
  w.cardTimer = 100;
  const inputs: PlayerInput[] = [];
  for (let s = 0; s < 4; s++) inputs[s] = s === by ? { ...NONE, buttons: CARD_BUTTON[0]! } : NONE;
  step(w, inputs);
}

describe('card pool', () => {
  it('has 35 cards, every one with a rarity, unique ids and consistent personal list', () => {
    expect(CARD_IDS.length).toBe(35);
    expect(new Set(CARD_IDS).size).toBe(35);
    for (const id of CARD_IDS) expect([0, 1, 2]).toContain(CARD_RARITY[id]);
    for (const p of PERSONAL_CARDS) expect(CARD_IDS).toContain(p);
    for (const id of Object.keys(CARD_RARITY)) expect(CARD_IDS).toContain(id);
    const perkCards = ['regen', 'thorns', 'shock', 'volatile', 'frost', 'scavenger', 'adrenaline', 'barrier', 'secondwind', 'rage'];
    for (const id of CARD_IDS) expect(BALANCE.progression.cards).toHaveProperty(id === 'arsenal' || id === 'heal' || id === 'ammo' || perkCards.includes(id) ? 'damage' : id);
  });

  it('offers three different cards and favours common over rare over epic', () => {
    const count = new Array<number>(CARD_IDS.length).fill(0);
    const w = quiet(5);
    addPlayer(w, 0, 0, 0);
    for (let n = 0; n < 4000; n++) {
      w.cardOffer.fill(-1);
      w.pendingLevels = 0;
      w.level = 1;
      w.xp = 0;
      awardXp(w, xpForNext(w));
      const offer = Array.from(w.cardOffer);
      expect(new Set(offer).size).toBe(3);
      for (const c of offer) count[c]!++;
    }
    const byRarity = [0, 0, 0];
    const members = [0, 0, 0];
    CARD_IDS.forEach((id, i) => {
      byRarity[CARD_RARITY[id]]! += count[i]!;
      members[CARD_RARITY[id]]!++;
    });
    const avg = byRarity.map((c, r) => c / members[r]!);
    expect(avg[0]!).toBeGreaterThan(avg[1]! * 1.4);
    expect(avg[1]!).toBeGreaterThan(avg[2]! * 1.8);
    for (let i = 0; i < CARD_IDS.length; i++) expect(count[i], CARD_IDS[i]).toBeGreaterThan(0);
    expect(RARITY_WEIGHT.length).toBe(3);
  });
});

describe('every card does what it says', () => {
  const c = BALANCE.progression.cards;
  const cases: [CardId, (w: World, before: Record<string, number>) => void][] = [
    ['damage', (w) => expect(w.modDamage).toBeCloseTo(1 + c.damage)],
    ['rate', (w) => expect(w.modRate).toBeCloseTo(1 + c.rate)],
    ['speed', (w) => expect(w.modSpeed).toBeCloseTo(1 + c.speed)],
    ['hp', (w) => expect(w.pMaxHp[0]).toBe(BALANCE.player.hp + c.hp)],
    ['pierce', (w) => expect(w.modPierce).toBe(c.pierce)],
    ['arsenal', (w) => expect(WEAPON_IDS[w.pWeapon[0]!]).toBe('mp')], // the next missing weapon above the pistol, taken into the hands
    ['heal', (w) => expect(w.pHp[0]).toBe(w.pMaxHp[0])],
    ['ammo', (w) => expect(w.pAmmo[0]).toBe(BALANCE.weapons.smg.ammo)],
    ['grenades', (w, b) => expect(w.pGren[0]).toBe(b.gren! + c.grenades)],
    ['medic', (w) => expect(w.modRevive).toBeCloseTo(c.medic)],
    ['magnet', (w) => expect(w.modMagnet).toBeCloseTo(c.magnet)],
    ['luck', (w) => expect(w.modLoot).toBeCloseTo(c.luck)],
    ['scholar', (w) => expect(w.modXp).toBeCloseTo(c.scholar)],
    ['blast', (w) => expect(w.modBlast).toBeCloseTo(c.blast)],
    ['quickhands', (w) => expect(w.modReload).toBeCloseTo(c.quickhands)],
    ['roll', (w) => expect(w.modDash).toBeCloseTo(c.roll)],
    ['armor', (w) => expect(w.modArmor).toBeCloseTo(c.armor)],
    ['crit', (w) => expect(w.modCrit).toBeCloseTo(c.crit)],
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
      if (id === 'heal') w.pHp[0] = 10;
      if (id === 'ammo') {
        addPlayer(w, 0, 0, 0, 'smg');
        w.pAmmo[0] = 0;
        w.pMag[0] = 0;
      }
      const before = { gren: w.pGren[0]! };
      w.pendingLevels = 0;
      pick(w, id);
      expect(w.events.some((e) => e.type === 'cardPicked'), 'card was taken').toBe(true);
      check(w, before);
    });
  }

  it('multiplier cards stop at their limits', () => {
    const w = quiet(11);
    addPlayer(w, 0, 0, 0);
    for (let i = 0; i < 20; i++) {
      for (const id of ['medic', 'magnet', 'luck', 'blast', 'quickhands', 'roll', 'armor', 'crit', 'ironskin'] as CardId[]) pick(w, id);
    }
    expect(w.modRevive).toBeCloseTo(c.medicMin);
    expect(w.modMagnet).toBeCloseTo(c.magnetMax);
    expect(w.modLoot).toBeCloseTo(c.luckMax);
    expect(w.modBlast).toBeCloseTo(c.blastMax);
    expect(w.modReload).toBeCloseTo(c.quickMin);
    expect(w.modDash).toBeCloseTo(c.rollMin);
    expect(w.modArmor).toBeCloseTo(c.armorMin);
    expect(w.modCrit).toBeCloseTo(c.critMax);
    expect(w.pModArmor[0]).toBeCloseTo(c.ironMin);
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
    expect(hit((w) => (w.modArmor = 0.5))).toBeCloseTo(base * 0.5, 5);
    expect(hit((w) => (w.pModArmor[0] = 0.5))).toBeCloseTo(base * 0.5, 5);
  });

  it('crit doubles some bullets; vampire heals on a kill; scholar gives more xp', () => {
    const damages = (crit: number): number[] => {
      const w = quiet(21);
      addPlayer(w, 0, 0, 0, 'ar');
      w.modCrit = crit;
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
    a.modXp = 2;
    awardXp(a, 10);
    expect(a.xp).toBe(20);
  });

  it('magnet pulls loot from further away; luck makes drops more common; medic revives faster; blast grows explosions', () => {
    const w = quiet(24);
    addPlayer(w, 0, 0, 0, 'ar');
    w.pAmmo[0] = 1;
    spawnPickup(w, PickupType.Ammo, BALANCE.pickups.magnetRadius + 1, 0);
    step(w, [NONE]);
    expect(w.kX[0]).toBe(BALANCE.pickups.magnetRadius + 1); // out of the normal pull
    w.modMagnet = 2;
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
      x.modRevive = mul;
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
      x.modBlast = mul;
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
