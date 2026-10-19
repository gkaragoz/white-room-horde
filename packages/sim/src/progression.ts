import { BALANCE, Buttons, CARD_IDS, CARD_RARITY, MAX_PLAYERS, PlayerState, RARITY_WEIGHT, TICK_RATE, WEAPON_IDS, type PlayerInput } from '@wrh/shared';
import { equipWeapon } from './loadout';
import type { World } from './state';

const CARDS = CARD_IDS.length;

/** Team xp from kills; every level opens a 3-card offer (docs/DESIGN.md section 9). */
export function awardXp(w: World, amount: number): void {
  const cfg = BALANCE.progression;
  w.xp += amount * w.modXp;
  for (;;) {
    const need = cfg.xpBase + cfg.xpPerLevel * w.level;
    if (w.xp < need) break;
    w.xp -= need;
    w.level++;
    w.pendingLevels++;
    w.events.push({ type: 'levelUp', level: w.level });
  }
  if (w.cardOffer[0]! < 0 && w.pendingLevels > 0) openOffer(w);
}

export function xpForNext(w: World): number {
  return BALANCE.progression.xpBase + BALANCE.progression.xpPerLevel * w.level;
}

/** Three different cards, drawn with weights by rarity (common 6, rare 3, epic 1). */
function openOffer(w: World): void {
  w.pendingLevels--;
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
  for (let i = 0; i < 3; i++) w.cardOffer[i] = picked[i]!;
  w.cardTimer = BALANCE.progression.cardSeconds * TICK_RATE;
  w.events.push({ type: 'cardOffer', cards: picked });
}

function applyCard(w: World, card: number, by: number): void {
  const c = BALANCE.progression.cards;
  switch (CARD_IDS[card]) {
    case 'damage':
      w.modDamage += c.damage;
      break;
    case 'rate':
      w.modRate += c.rate;
      break;
    case 'speed':
      w.modSpeed += c.speed;
      break;
    case 'hp':
      w.modHp += c.hp;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s]) continue;
        w.pMaxHp[s] = w.pMaxHp[s]! + c.hp;
        if (w.pState[s] === PlayerState.Alive) w.pHp[s] = w.pHp[s]! + c.hp;
      }
      break;
    case 'pierce':
      w.modPierce += c.pierce;
      break;
    case 'arsenal':
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s]) continue;
        equipWeapon(w, s, (w.pWeapon[s]! + 1) % WEAPON_IDS.length);
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
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) equipWeapon(w, s, w.pWeapon[s]!);
      break;
    case 'grenades':
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s]) w.pGren[s] = w.pGren[s]! + c.grenades;
      break;
    case 'medic':
      w.modRevive = Math.max(c.medicMin, w.modRevive * c.medic);
      break;
    case 'magnet':
      w.modMagnet = Math.min(c.magnetMax, w.modMagnet * c.magnet);
      break;
    case 'luck':
      w.modLoot = Math.min(c.luckMax, w.modLoot * c.luck);
      break;
    case 'scholar':
      w.modXp *= c.scholar;
      break;
    case 'blast':
      w.modBlast = Math.min(c.blastMax, w.modBlast * c.blast);
      break;
    case 'quickhands':
      w.modReload = Math.max(c.quickMin, w.modReload * c.quickhands);
      break;
    case 'roll':
      w.modDash = Math.max(c.rollMin, w.modDash * c.roll);
      break;
    case 'armor':
      w.modArmor = Math.max(c.armorMin, w.modArmor * c.armor);
      break;
    case 'crit':
      w.modCrit = Math.min(c.critMax, w.modCrit + c.crit);
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
    case 'heal':
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (w.pActive[s] && w.pState[s] === PlayerState.Alive) w.pHp[s] = w.pMaxHp[s]!;
      }
      break;
  }
}

/** Resolve an open offer: first player (lowest slot) pressing Card1..3 wins, otherwise a random card when time runs out. */
export function updateCards(w: World, inputs: ReadonlyArray<PlayerInput | undefined>): void {
  if (w.cardOffer[0]! < 0) return;
  let choice = -1;
  let by = -1;
  for (let s = 0; s < MAX_PLAYERS && choice < 0; s++) {
    const b = inputs[s]?.buttons ?? 0;
    if (!w.pActive[s]) continue;
    if (b & Buttons.Card1) choice = 0;
    else if (b & Buttons.Card2) choice = 1;
    else if (b & Buttons.Card3) choice = 2;
    if (choice >= 0) by = s;
  }
  w.cardTimer--;
  if (choice < 0 && w.cardTimer <= 0) choice = w.rng.int(3);
  if (choice < 0) return;
  const card = w.cardOffer[choice]!;
  w.cardOffer.fill(-1);
  if (by < 0) {
    // nobody chose in time: personal cards go to the first living player
    for (let s = 0; s < MAX_PLAYERS && by < 0; s++) if (w.pActive[s] && w.pState[s] === PlayerState.Alive) by = s;
  }
  applyCard(w, card, by);
  w.events.push({ type: 'cardPicked', card, by });
  if (w.pendingLevels > 0) openOffer(w);
}
