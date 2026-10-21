import { grantDrone } from './drones';
import { BALANCE, Buttons, CARD_CLASS, CARD_IDS, CARD_RARITY, FloorPhase, MAX_PLAYERS, MISC, PlayerState, RARITY_WEIGHT, TICK_RATE, type PlayerInput } from '@wrh/shared';
import { PERK } from '@wrh/shared';
import { applyUniversal } from './cardtable';
import { addPerk, perk, setPerk } from './features';
import { giveWeapon, nextMissing, selectWeapon } from './loadout';
import type { World } from './state';
import { fxOf } from './mods';

const CARDS = CARD_IDS.length;

/** After a pick the next queued offer waits this long, so a key still held (or repeated by the server) cannot pick for the next one. */
const PICK_LOCK_TICKS = 12;
const CARD_BUTTONS = Buttons.Card1 | Buttons.Card2 | Buttons.Card3;

/**
 * Levels bank up in `pPending` during a floor. Offers open one at a time, only once the floor is cleared (or on the new floor
 * before its enemies come), never in the middle of a fight, never during the climb, and not right after a pick.
 */
function tryOpen(w: World, slot: number): void {
  if (w.pOffer[slot * 3]! >= 0 || w.pPending[slot]! <= 0 || w.pCardLock[slot]! > 0) return;
  const phase = w.misc[MISC.Phase];
  if (phase !== FloorPhase.Cleared && phase !== FloorPhase.Arrive) return;
  openOffer(w, slot);
}

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
  tryOpen(w, slot);
}

export function xpForNext(w: World, slot: number): number {
  return BALANCE.progression.xpBase + BALANCE.progression.xpPerLevel * w.pLevel[slot]!;
}

/** Three different cards for one character, drawn with weights by rarity (common 6, rare 3, epic 1) among the cards its class can use. */
function openOffer(w: World, slot: number): void {
  w.pPending[slot] = w.pPending[slot]! - 1;
  const picked: number[] = [];
  const cls = perk(w, slot, PERK.Class);
  const pool: number[] = [];
  let total = 0;
  for (let c = 0; c < CARDS; c++) {
    const id = CARD_IDS[c]!;
    if (((CARD_CLASS[id] >> cls) & 1) === 0) continue;
    pool.push(c);
    total += RARITY_WEIGHT[CARD_RARITY[id]]!;
  }
  while (picked.length < 3) {
    let r = w.rng.int(total);
    let chosen = pool[pool.length - 1]!;
    for (const c of pool) {
      r -= RARITY_WEIGHT[CARD_RARITY[CARD_IDS[c]!]]!;
      if (r < 0) {
        chosen = c;
        break;
      }
    }
    if (!picked.includes(chosen)) picked.push(chosen);
  }
  for (let i = 0; i < 3; i++) w.pOffer[slot * 3 + i] = picked[i]!;
  w.pCardTimer[slot] = Math.round(BALANCE.progression.cardSeconds * fxOf(w).cardSeconds * TICK_RATE);
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
        } else w.modReload[by] = Math.max(c.quickMin, w.modReload[by]! * c.loader);
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
      // the old ammo card is a speed loader now: ammo is unlimited, reloading is the only cost
      w.modReload[by] = Math.max(c.quickMin, w.modReload[by]! * c.loader);
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
    case 'drone':
      // a new drone for the inventory (a duplicate turns into experience for the active one)
      if (by >= 0) grantDrone(w, by, -1);
      break;
    case 'heal':
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (w.pActive[s] && w.pState[s] === PlayerState.Alive) w.pHp[s] = w.pMaxHp[s]!;
      }
      break;
    default:
      // the universal cards: a table of stat changes
      applyUniversal(w, CARD_IDS[card]!, by);
      break;
  }
}

/**
 * Resolve every character's own offer: their Card1..3 buttons pick, a random card when their own time runs out. A downed
 * or dead character's offer waits for them (the clock stops). One character's offer never blocks another's.
 */
export function updateCards(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  const climbing = w.misc[MISC.Phase] === FloorPhase.Ascend;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const held = (inputs[s]?.buttons ?? 0) & CARD_BUTTONS;
    const fresh = held & ~w.pCardPrev[s]!;
    w.pCardPrev[s] = held;
    if (w.pState[s] !== PlayerState.Alive) continue;
    if (w.pCardLock[s]! > 0) w.pCardLock[s] = w.pCardLock[s]! - 1;
    if (w.pOffer[s * 3]! < 0) {
      tryOpen(w, s);
      continue;
    }
    let choice = -1;
    if (fresh & Buttons.Card1) choice = 0;
    else if (fresh & Buttons.Card2) choice = 1;
    else if (fresh & Buttons.Card3) choice = 2;
    if (!climbing) w.pCardTimer[s] = w.pCardTimer[s]! - 1; // the clock of an open offer waits while the floor is being climbed (picking is still allowed)
    if (choice < 0 && !climbing && w.pCardTimer[s]! <= 0) choice = 0; // out of time: the first card (no dice)
    if (choice < 0) continue;
    const card = w.pOffer[s * 3 + choice]!;
    for (let i = 0; i < 3; i++) w.pOffer[s * 3 + i] = -1;
    applyCard(w, card, s);
    const at = s * CARDS + card;
    if (w.pCards[at]! < 255) w.pCards[at] = w.pCards[at]! + 1;
    w.events.push({ type: 'cardPicked', card, by: s });
    w.pCardLock[s] = PICK_LOCK_TICKS;
  }
}
