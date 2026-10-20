import { BALANCE, Buttons, CARD_IDS, CARD_RARITY, MAX_PLAYERS, PlayerState, RARITY_WEIGHT, TICK_RATE, type PlayerInput } from '@wrh/shared';
import { PERK } from '@wrh/shared';
import { addPerk, perk, setPerk } from './features';
import { giveWeapon, nextMissing, refillAll, selectWeapon } from './loadout';
import type { World } from './state';

const CARDS = CARD_IDS.length;

/** Experience belongs to the character that made the kill; every level opens a 3-card offer for that character only (docs/DESIGN.md section 9). */
export function awardXp(w: World, slot: number, amount: number): void {
  if (!w.pActive[slot]) return;
  const cfg = BALANCE.progression;
  w.pXp[slot] = w.pXp[slot]! + amount * w.modXp[slot]!;
  for (;;) {
    const need = cfg.xpBase + cfg.xpPerLevel * w.pLevel[slot]!;
    if (w.pXp[slot]! < need) break;
    w.pXp[slot] = w.pXp[slot]! - need;
    w.pLevel[slot] = w.pLevel[slot]! + 1;
    w.pPending[slot] = w.pPending[slot]! + 1;
    w.events.push({ type: 'levelUp', slot, level: w.pLevel[slot]! });
  }
  if (w.pOffer[slot * 3]! < 0 && w.pPending[slot]! > 0) openOffer(w, slot);
}

export function xpForNext(w: World, slot: number): number {
  return BALANCE.progression.xpBase + BALANCE.progression.xpPerLevel * w.pLevel[slot]!;
}

/** Three different cards for one character, drawn with weights by rarity (common 6, rare 3, epic 1). */
function openOffer(w: World, slot: number): void {
  w.pPending[slot] = w.pPending[slot]! - 1;
  const picked: number[] = [];
  let total = 0;
  for (let c = 0; c < CARDS; c++) total += RARITY_WEIGHT[CARD_RARITY[CARD_IDS[c]!]]!;
  while (picked.length < 3) {
    let r = w.rng.int(total);
    let chosen = CARDS - 1;
    for (let c = 0; c < CARDS; c++) {
      r -= RARITY_WEIGHT[CARD_RARITY[CARD_IDS[c]!]]!;
      if (r < 0) {
        chosen = c;
        break;
      }
    }
    if (!picked.includes(chosen)) picked.push(chosen);
  }
  for (let i = 0; i < 3; i++) w.pOffer[slot * 3 + i] = picked[i]!;
  w.pCardTimer[slot] = BALANCE.progression.cardSeconds * TICK_RATE;
  w.events.push({ type: 'cardOffer', slot, cards: picked });
}

/** The upgrade goes to the character `by` (always a real slot: the offer belongs to them); only TEAM_CARDS touch everybody. */
function applyCard(w: World, card: number, by: number): void {
  const c = BALANCE.progression.cards;
  switch (CARD_IDS[card]) {
    case 'damage':
      w.modDamage[by] = w.modDamage[by]! + c.damage;
      break;
    case 'rate':
      w.modRate[by] = w.modRate[by]! + c.rate;
      break;
    case 'speed':
      w.modSpeed[by] = w.modSpeed[by]! + c.speed;
      break;
    case 'hp':
      w.pMaxHp[by] = w.pMaxHp[by]! + c.hp;
      if (w.pState[by] === PlayerState.Alive) w.pHp[by] = w.pHp[by]! + c.hp;
      break;
    case 'pierce':
      w.modPierce[by] = w.modPierce[by]! + c.pierce;
      break;
    case 'arsenal':
      {
        const gift = nextMissing(w, by);
        if (gift >= 0) {
          giveWeapon(w, by, gift);
          selectWeapon(w, by, gift);
        } else refillAll(w, by);
      }
      break;
    case 'sharp':
      if (by >= 0) w.pModDmg[by] = w.pModDmg[by]! + c.sharp;
      break;
    case 'sprint':
      if (by >= 0) w.pModSpeed[by] = w.pModSpeed[by]! + c.sprint;
      break;
    case 'bulk':
      if (by >= 0) {
        w.pMaxHp[by] = w.pMaxHp[by]! + c.bulk;
        if (w.pState[by] === PlayerState.Alive) w.pHp[by] = w.pHp[by]! + c.bulk;
      }
      break;
    case 'ammo':
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) refillAll(w, s);
      break;
    case 'grenades':
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) w.pGren[s] = w.pGren[s]! + c.grenades;
      break;
    case 'medic':
      w.modRevive[by] = Math.max(c.medicMin, w.modRevive[by]! * c.medic);
      break;
    case 'magnet':
      w.modMagnet[by] = Math.min(c.magnetMax, w.modMagnet[by]! * c.magnet);
      break;
    case 'luck':
      w.modLoot = Math.min(c.luckMax, w.modLoot * c.luck);
      break;
    case 'scholar':
      w.modXp[by] = w.modXp[by]! * c.scholar;
      break;
    case 'blast':
      w.modBlast[by] = Math.min(c.blastMax, w.modBlast[by]! * c.blast);
      break;
    case 'quickhands':
      w.modReload[by] = Math.max(c.quickMin, w.modReload[by]! * c.quickhands);
      break;
    case 'roll':
      w.modDash[by] = Math.max(c.rollMin, w.modDash[by]! * c.roll);
      break;
    case 'armor':
      w.modArmor[by] = Math.max(c.armorMin, w.modArmor[by]! * c.armor);
      break;
    case 'crit':
      w.modCrit[by] = Math.min(c.critMax, w.modCrit[by]! + c.crit);
      break;
    case 'vampire':
      if (by >= 0) w.pLifesteal[by] = w.pLifesteal[by]! + c.vampire;
      break;
    case 'tempo':
      if (by >= 0) w.pModRate[by] = w.pModRate[by]! + c.tempo;
      break;
    case 'marksman':
      if (by >= 0) w.pModPierce[by] = w.pModPierce[by]! + c.marksman;
      break;
    case 'ironskin':
      if (by >= 0) w.pModArmor[by] = Math.max(c.ironMin, w.pModArmor[by]! * c.ironskin);
      break;
    case 'regen':
      if (by >= 0) addPerk(w, by, PERK.Regen, BALANCE.perks.cardRegen);
      break;
    case 'thorns':
      if (by >= 0) addPerk(w, by, PERK.Thorns, BALANCE.perks.thorns);
      break;
    case 'shock':
      if (by >= 0) setPerk(w, by, PERK.Shock, 1);
      break;
    case 'volatile':
      if (by >= 0) addPerk(w, by, PERK.Volatile, BALANCE.perks.volatileChance);
      break;
    case 'frost':
      if (by >= 0) setPerk(w, by, PERK.Frost, 1);
      break;
    case 'scavenger':
      if (by >= 0) addPerk(w, by, PERK.Scav, BALANCE.perks.scavChance);
      break;
    case 'adrenaline':
      if (by >= 0) setPerk(w, by, PERK.AdrenCard, 1);
      break;
    case 'barrier':
      if (by >= 0) {
        addPerk(w, by, PERK.ShieldMax, BALANCE.perks.barrierAmount);
        setPerk(w, by, PERK.Shield, perk(w, by, PERK.ShieldMax));
      }
      break;
    case 'secondwind':
      if (by >= 0) addPerk(w, by, PERK.Second, 1);
      break;
    case 'rage':
      if (by >= 0) addPerk(w, by, PERK.Rage, 1);
      break;
    case 'heal':
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (w.pActive[s] && w.pState[s] === PlayerState.Alive) w.pHp[s] = w.pMaxHp[s]!;
      }
      break;
  }
}

/**
 * Resolve every character's own offer: their Card1..3 buttons pick, a random card when their own time runs out. A downed
 * or dead character's offer waits for them (the clock stops). One character's offer never blocks another's.
 */
export function updateCards(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s] || w.pOffer[s * 3]! < 0 || w.pState[s] !== PlayerState.Alive) continue;
    const b = inputs[s]?.buttons ?? 0;
    let choice = -1;
    if (b & Buttons.Card1) choice = 0;
    else if (b & Buttons.Card2) choice = 1;
    else if (b & Buttons.Card3) choice = 2;
    w.pCardTimer[s] = w.pCardTimer[s]! - 1;
    if (choice < 0 && w.pCardTimer[s]! <= 0) choice = w.rng.int(3);
    if (choice < 0) continue;
    const card = w.pOffer[s * 3 + choice]!;
    for (let i = 0; i < 3; i++) w.pOffer[s * 3 + i] = -1;
    applyCard(w, card, s);
    w.events.push({ type: 'cardPicked', card, by: s });
    if (w.pPending[s]! > 0) openOffer(w, s);
  }
}
