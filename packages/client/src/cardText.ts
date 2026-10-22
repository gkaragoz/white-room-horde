import { CARD_STATS, CLASS_CARDS, UNIVERSAL_CARDS } from '@wrh/shared';
import type { Lang } from './ui';

/**
 * Names and descriptions of the 50 universal cards. The name is in the table (packages/shared/src/cards-universal.ts); the
 * description is made from the card's stat changes with the phrases below, so the text can never disagree with the numbers.
 * A phrase has `up` (the stat grows) and `down` (it shrinks) with {n} for the amount.
 */
interface Phrase {
  up: string;
  down: string;
}

const P: Record<Lang, Record<string, Phrase>> = {
  en: {
    dmg: { up: '+{n}% damage', down: '-{n}% damage' },
    rate: { up: '+{n}% fire rate', down: '-{n}% fire rate' },
    speed: { up: '+{n}% speed', down: '-{n}% speed' },
    pierce: { up: 'Bullets pierce +{n} enemy', down: 'Bullets pierce -{n}' },
    armor: { up: 'Take {n}% more damage', down: 'Take {n}% less damage' },
    crit: { up: '+{n}% crit chance', down: '-{n}% crit chance' },
    reload: { up: 'Reload {n}% slower', down: 'Reload {n}% faster' },
    dash: { up: 'Dash cooldown +{n}%', down: 'Dash cooldown -{n}%' },
    magnet: { up: '+{n}% pickup range', down: '-{n}% pickup range' },
    xp: { up: '+{n}% experience', down: '-{n}% experience' },
    blast: { up: '+{n}% explosion size', down: '-{n}% explosion size' },
    revive: { up: 'Revive {n}% slower', down: 'Revive {n}% faster' },
    steal: { up: 'Heal {n} on every kill', down: '' },
    hp: { up: '+{n} max health', down: '-{n} max health' },
    gren: { up: '+{n} grenade', down: '-{n} grenade' },
    heal: { up: 'Heal {n}% now', down: '' },
    loot: { up: '+{n}% loot drops', down: '-{n}% loot drops' },
    regen: { up: '+{n} health per second', down: '' },
    thorns: { up: 'Reflect {n} damage', down: '' },
    shield: { up: '+{n} shield', down: '' },
    acd: { up: 'Ability cooldown +{n}%', down: 'Ability cooldown -{n}%' },
    adur: { up: 'Ability lasts +{n}%', down: 'Ability lasts -{n}%' },
    admg: { up: 'Ability power +{n}%', down: 'Ability power -{n}%' },
    arad: { up: 'Ability radius +{n}%', down: 'Ability radius -{n}%' },
    aextra: { up: 'Ability: +{n} more shots', down: 'Ability: -{n} shots' },
  },
  tr: {
    dmg: { up: '+%{n} hasar', down: '-%{n} hasar' },
    rate: { up: '+%{n} atış hızı', down: '-%{n} atış hızı' },
    speed: { up: '+%{n} hız', down: '-%{n} hız' },
    pierce: { up: 'Mermiler +{n} düşmanı deler', down: 'Mermiler {n} az deler' },
    armor: { up: '%{n} daha çok hasar al', down: '%{n} daha az hasar al' },
    crit: { up: '+%{n} kritik şansı', down: '-%{n} kritik şansı' },
    reload: { up: 'Doldurma %{n} yavaş', down: 'Doldurma %{n} hızlı' },
    dash: { up: 'Atılma bekleme +%{n}', down: 'Atılma bekleme -%{n}' },
    magnet: { up: '+%{n} toplama menzili', down: '-%{n} toplama menzili' },
    xp: { up: '+%{n} deneyim', down: '-%{n} deneyim' },
    blast: { up: '+%{n} patlama boyu', down: '-%{n} patlama boyu' },
    revive: { up: 'Kaldırma %{n} yavaş', down: 'Kaldırma %{n} hızlı' },
    steal: { up: 'Her öldürmede {n} can', down: '' },
    hp: { up: '+{n} maks can', down: '-{n} maks can' },
    gren: { up: '+{n} bomba', down: '-{n} bomba' },
    heal: { up: 'Şimdi %{n} can yenile', down: '' },
    loot: { up: '+%{n} ganimet', down: '-%{n} ganimet' },
    regen: { up: 'Saniyede +{n} can', down: '' },
    thorns: { up: '{n} hasarı geri yansıt', down: '' },
    shield: { up: '+{n} kalkan', down: '' },
    acd: { up: 'Yetenek bekleme +%{n}', down: 'Yetenek bekleme -%{n}' },
    adur: { up: 'Yetenek süresi +%{n}', down: 'Yetenek süresi -%{n}' },
    admg: { up: 'Yetenek gücü +%{n}', down: 'Yetenek gücü -%{n}' },
    arad: { up: 'Yetenek menzili +%{n}', down: 'Yetenek menzili -%{n}' },
    aextra: { up: 'Yetenek: {n} atış fazla', down: 'Yetenek: {n} atış az' },
  },
  de: {
    dmg: { up: '+{n} % Schaden', down: '-{n} % Schaden' },
    rate: { up: '+{n} % Feuerrate', down: '-{n} % Feuerrate' },
    speed: { up: '+{n} % Tempo', down: '-{n} % Tempo' },
    pierce: { up: 'Kugeln durchschlagen +{n} Gegner', down: 'Kugeln durchschlagen {n} weniger' },
    armor: { up: '{n} % mehr Schaden erhalten', down: '{n} % weniger Schaden erhalten' },
    crit: { up: '+{n} % Krit-Chance', down: '-{n} % Krit-Chance' },
    reload: { up: 'Nachladen {n} % langsamer', down: 'Nachladen {n} % schneller' },
    dash: { up: 'Ausweich-Abklingzeit +{n} %', down: 'Ausweich-Abklingzeit -{n} %' },
    magnet: { up: '+{n} % Aufnahmeradius', down: '-{n} % Aufnahmeradius' },
    xp: { up: '+{n} % Erfahrung', down: '-{n} % Erfahrung' },
    blast: { up: '+{n} % Explosionsgröße', down: '-{n} % Explosionsgröße' },
    revive: { up: 'Wiederbeleben {n} % langsamer', down: 'Wiederbeleben {n} % schneller' },
    steal: { up: '{n} Leben pro Abschuss', down: '' },
    hp: { up: '+{n} max. Leben', down: '-{n} max. Leben' },
    gren: { up: '+{n} Granate', down: '-{n} Granate' },
    heal: { up: 'Sofort {n} % heilen', down: '' },
    loot: { up: '+{n} % Beute', down: '-{n} % Beute' },
    regen: { up: '+{n} Leben pro Sekunde', down: '' },
    thorns: { up: '{n} Schaden zurückwerfen', down: '' },
    shield: { up: '+{n} Schild', down: '' },
    acd: { up: 'Fähigkeits-Abklingzeit +{n} %', down: 'Fähigkeits-Abklingzeit -{n} %' },
    adur: { up: 'Fähigkeit hält {n} % länger', down: 'Fähigkeit hält {n} % kürzer' },
    admg: { up: 'Fähigkeitsstärke +{n} %', down: 'Fähigkeitsstärke -{n} %' },
    arad: { up: 'Fähigkeitsradius +{n} %', down: 'Fähigkeitsradius -{n} %' },
    aextra: { up: 'Fähigkeit: +{n} Schüsse', down: 'Fähigkeit: -{n} Schüsse' },
  },
  es: {
    dmg: { up: '+{n} % de daño', down: '-{n} % de daño' },
    rate: { up: '+{n} % de cadencia', down: '-{n} % de cadencia' },
    speed: { up: '+{n} % de velocidad', down: '-{n} % de velocidad' },
    pierce: { up: 'Las balas atraviesan +{n} enemigo', down: 'Las balas atraviesan {n} menos' },
    armor: { up: '{n} % más de daño recibido', down: '{n} % menos de daño recibido' },
    crit: { up: '+{n} % de crítico', down: '-{n} % de crítico' },
    reload: { up: 'Recarga {n} % más lenta', down: 'Recarga {n} % más rápida' },
    dash: { up: 'Enfriamiento del impulso +{n} %', down: 'Enfriamiento del impulso -{n} %' },
    magnet: { up: '+{n} % de alcance de recogida', down: '-{n} % de alcance de recogida' },
    xp: { up: '+{n} % de experiencia', down: '-{n} % de experiencia' },
    blast: { up: '+{n} % de tamaño de explosión', down: '-{n} % de tamaño de explosión' },
    revive: { up: 'Reanimar {n} % más lento', down: 'Reanimar {n} % más rápido' },
    steal: { up: 'Cura {n} por cada baja', down: '' },
    hp: { up: '+{n} de vida máxima', down: '-{n} de vida máxima' },
    gren: { up: '+{n} granada', down: '-{n} granada' },
    heal: { up: 'Cura {n} % ahora', down: '' },
    loot: { up: '+{n} % de botín', down: '-{n} % de botín' },
    regen: { up: '+{n} de vida por segundo', down: '' },
    thorns: { up: 'Devuelve {n} de daño', down: '' },
    shield: { up: '+{n} de escudo', down: '' },
    acd: { up: 'Enfriamiento de habilidad +{n} %', down: 'Enfriamiento de habilidad -{n} %' },
    adur: { up: 'La habilidad dura {n} % más', down: 'La habilidad dura {n} % menos' },
    admg: { up: 'Poder de habilidad +{n} %', down: 'Poder de habilidad -{n} %' },
    arad: { up: 'Radio de habilidad +{n} %', down: 'Radio de habilidad -{n} %' },
    aextra: { up: 'Habilidad: +{n} disparos', down: 'Habilidad: -{n} disparos' },
  },
  fr: {
    dmg: { up: '+{n} % de dégâts', down: '-{n} % de dégâts' },
    rate: { up: '+{n} % de cadence', down: '-{n} % de cadence' },
    speed: { up: '+{n} % de vitesse', down: '-{n} % de vitesse' },
    pierce: { up: 'Les balles traversent +{n} ennemi', down: 'Les balles traversent {n} de moins' },
    armor: { up: '{n} % de dégâts subis en plus', down: '{n} % de dégâts subis en moins' },
    crit: { up: '+{n} % de critique', down: '-{n} % de critique' },
    reload: { up: 'Rechargement {n} % plus lent', down: 'Rechargement {n} % plus rapide' },
    dash: { up: 'Récupération de l’élan +{n} %', down: 'Récupération de l’élan -{n} %' },
    magnet: { up: '+{n} % de portée de ramassage', down: '-{n} % de portée de ramassage' },
    xp: { up: '+{n} % d’expérience', down: '-{n} % d’expérience' },
    blast: { up: '+{n} % de taille d’explosion', down: '-{n} % de taille d’explosion' },
    revive: { up: 'Réanimation {n} % plus lente', down: 'Réanimation {n} % plus rapide' },
    steal: { up: 'Soigne {n} à chaque victime', down: '' },
    hp: { up: '+{n} de vie max', down: '-{n} de vie max' },
    gren: { up: '+{n} grenade', down: '-{n} grenade' },
    heal: { up: 'Soigne {n} % maintenant', down: '' },
    loot: { up: '+{n} % de butin', down: '-{n} % de butin' },
    regen: { up: '+{n} de vie par seconde', down: '' },
    thorns: { up: 'Renvoie {n} de dégâts', down: '' },
    shield: { up: '+{n} de bouclier', down: '' },
    acd: { up: 'Récupération de capacité +{n} %', down: 'Récupération de capacité -{n} %' },
    adur: { up: 'La capacité dure {n} % de plus', down: 'La capacité dure {n} % de moins' },
    admg: { up: 'Puissance de capacité +{n} %', down: 'Puissance de capacité -{n} %' },
    arad: { up: 'Rayon de capacité +{n} %', down: 'Rayon de capacité -{n} %' },
    aextra: { up: 'Capacité : +{n} tirs', down: 'Capacité : -{n} tirs' },
  },
  ru: {
    dmg: { up: '+{n}% урона', down: '-{n}% урона' },
    rate: { up: '+{n}% скорострельности', down: '-{n}% скорострельности' },
    speed: { up: '+{n}% скорости', down: '-{n}% скорости' },
    pierce: { up: 'Пули пробивают ещё {n} врага', down: 'Пули пробивают на {n} меньше' },
    armor: { up: 'Получаешь на {n}% больше урона', down: 'Получаешь на {n}% меньше урона' },
    crit: { up: '+{n}% шанса крита', down: '-{n}% шанса крита' },
    reload: { up: 'Перезарядка на {n}% дольше', down: 'Перезарядка на {n}% быстрее' },
    dash: { up: 'Перезарядка рывка +{n}%', down: 'Перезарядка рывка -{n}%' },
    magnet: { up: '+{n}% радиуса подбора', down: '-{n}% радиуса подбора' },
    xp: { up: '+{n}% опыта', down: '-{n}% опыта' },
    blast: { up: '+{n}% размера взрывов', down: '-{n}% размера взрывов' },
    revive: { up: 'Подъём на {n}% дольше', down: 'Подъём на {n}% быстрее' },
    steal: { up: 'Лечит {n} за каждое убийство', down: '' },
    hp: { up: '+{n} к макс. здоровью', down: '-{n} к макс. здоровью' },
    gren: { up: '+{n} граната', down: '-{n} граната' },
    heal: { up: 'Лечит {n}% сразу', down: '' },
    loot: { up: '+{n}% добычи', down: '-{n}% добычи' },
    regen: { up: '+{n} здоровья в секунду', down: '' },
    thorns: { up: 'Отражает {n} урона', down: '' },
    shield: { up: '+{n} щита', down: '' },
    acd: { up: 'Перезарядка способности +{n}%', down: 'Перезарядка способности -{n}%' },
    adur: { up: 'Способность длится на {n}% дольше', down: 'Способность длится на {n}% меньше' },
    admg: { up: 'Сила способности +{n}%', down: 'Сила способности -{n}%' },
    arad: { up: 'Радиус способности +{n}%', down: 'Радиус способности -{n}%' },
    aextra: { up: 'Способность: +{n} выстрелов', down: 'Способность: -{n} выстрелов' },
  },
};

function line(lang: Lang, stat: string, v: number): string {
  const def = CARD_STATS[stat];
  if (!def) return '';
  const phrase = P[lang][def.phrase] ?? P.en[def.phrase];
  if (!phrase) return '';
  let amount: number;
  let up = v > 0;
  if (def.format === 'factor') {
    amount = Math.round(Math.abs(v - 1) * 100);
    up = v > 1;
  } else if (def.format === 'fraction') {
    amount = Math.round(Math.abs(v) * 100);
  } else amount = Math.abs(v);
  return (up ? phrase.up : phrase.down || phrase.up).replace('{n}', String(amount));
}

/** The phrase tables, for the test that every stat is worded in every language. */
export const CARD_PHRASES = P;

/** id -> [title, text] for one language (the 50 universal and the 90 class cards). */
export function universalCardTexts(lang: Lang): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const c of [...UNIVERSAL_CARDS, ...CLASS_CARDS]) {
    out[c.id] = [c.names[lang], c.ops.map(([stat, v]) => line(lang, stat, v)).filter((s) => s).join(' · ')];
  }
  return out;
}
