import type { Lang } from './uiStrings';

/**
 * The words of the meta progression screens (level path, Codex, pack opening, corner card). English is complete; every other
 * language overrides what it translates and falls back to English for the rest. `{n}`, `{a}`, `{b}`, `{l}` are filled in by the caller.
 */
const EN = {
  level: 'Level',
  levelShort: 'Lv',
  max: 'MAX',
  next: 'Next',
  xpToNext: '{n} XP to level {l}',
  xpMax: 'Top level: XP keeps counting',
  path: 'Discovery path',
  codex: 'Codex',
  codexSub: '{a} / {b} discovered',
  tabs: { weapon: 'Weapons', drone: 'Drones', card: 'Cards', class: 'Classes', arena: 'Arenas', powerup: 'Power-ups', elite: 'Elites', enemy: 'Enemies', boss: 'Bosses' },
  discovered: 'Discovered',
  openedUnmet: 'Opened, not met yet',
  lockedLevel: 'Level {n}',
  lockedAch: 'Achievement',
  lockedMeet: 'Appears in a run',
  lockedTip: 'Unlocks at level {n}',
  lockedAchTip: 'Unlocked by an achievement',
  noteNew: 'New!',
  startLocked: 'Meet it in a run to start with it',
  packTitle: 'Level {a} to {b}',
  packTap: 'Tap to open',
  openAll: 'Open all',
  added: 'Added to the album',
  xpGain: '+{n} XP',
  xpNone: 'Runs shorter than 15 seconds give no XP',
  xpCompanions: 'XP reduced by companions (x{f})',
  levelUp: 'Level {a} to {b}',
  noLevelUp: 'Level {a}',
  rewardsNone: 'No new level this run',
  cornerAdded: 'Added to the album',
  pack: 'Card pack',
  packCards: '{n} cards',
  color: 'Colour {n}',
  look: 'Look',
  introTitle: 'A new way to progress',
  introBody: 'Everything starts locked now and opens as you play: every run earns XP, every level opens something new. Your records and your old save are kept safe.',
  introOk: 'Got it',
  met: 'Met',
};

export type MetaWords = typeof EN;

const TR: Partial<Record<keyof MetaWords, unknown>> = {
  xpCompanions: 'Yoldaşlar nedeniyle XP azaldı (x{f})',
  level: 'Seviye',
  levelShort: 'Sv',
  max: 'MAKS',
  next: 'Sıradaki',
  xpToNext: 'Seviye {l} için {n} XP',
  xpMax: 'Son seviye: XP birikmeye devam eder',
  path: 'Keşif yolu',
  codexSub: '{a} / {b} keşfedildi',
  tabs: { weapon: 'Silahlar', drone: 'Dronelar', card: 'Kartlar', class: 'Classlar', arena: 'Arenalar', powerup: 'Güç-artırıcılar', elite: 'Elitler', enemy: 'Düşmanlar', boss: 'Bosslar' },
  discovered: 'Keşfedildi',
  openedUnmet: 'Açıldı, henüz görülmedi',
  lockedLevel: 'Seviye {n}',
  lockedAch: 'Başarım',
  lockedMeet: 'Bir run\'da görünür',
  lockedTip: 'Seviye {n}\'de açılır',
  lockedAchTip: 'Bir başarımla açılır',
  noteNew: 'Yeni!',
  startLocked: "Bir run'da görünce başlangıç silahı olur",
  packTitle: 'Seviye {a} - {b}',
  packTap: 'Açmak için dokun',
  openAll: 'Hepsini aç',
  added: 'Albüme eklendi',
  xpNone: '15 saniyeden kısa run XP vermez',
  levelUp: 'Seviye {a} - {b}',
  noLevelUp: 'Seviye {a}',
  rewardsNone: 'Bu run yeni seviye yok',
  cornerAdded: 'Albüme eklendi',
  pack: 'Kart paketi',
  packCards: '{n} kart',
  color: 'Renk {n}',
  look: 'Görünüm',
  introTitle: 'Yeni ilerleme sistemi',
  introBody: 'Her şey artık kilitli başlıyor ve oynadıkça açılıyor: her run XP kazandırır, her seviye yeni bir şey açar. Rekorların ve eski kaydın korunuyor.',
  introOk: 'Tamam',
  met: 'Görüldü',
};

const DE: Partial<Record<keyof MetaWords, unknown>> = {
  xpCompanions: 'XP durch Begleiter verringert (x{f})',
  level: 'Stufe',
  levelShort: 'St.',
  max: 'MAX',
  next: 'Als Nächstes',
  xpToNext: '{n} XP bis Stufe {l}',
  path: 'Entdeckungspfad',
  codexSub: '{a} / {b} entdeckt',
  tabs: { weapon: 'Waffen', drone: 'Drohnen', card: 'Karten', class: 'Klassen', arena: 'Arenen', powerup: 'Power-ups', elite: 'Elite', enemy: 'Gegner', boss: 'Bosse' },
  discovered: 'Entdeckt',
  openedUnmet: 'Freigeschaltet, noch nicht gesehen',
  lockedLevel: 'Stufe {n}',
  lockedAch: 'Erfolg',
  noteNew: 'Neu!',
  packTap: 'Zum Öffnen tippen',
  openAll: 'Alle öffnen',
  added: 'Zum Album hinzugefügt',
  cornerAdded: 'Zum Album hinzugefügt',
  pack: 'Kartenpaket',
  introTitle: 'Neuer Fortschritt',
  introOk: 'Verstanden',
};

const ES: Partial<Record<keyof MetaWords, unknown>> = {
  xpCompanions: 'XP reducida por los compañeros (x{f})',
  level: 'Nivel',
  levelShort: 'Nv',
  max: 'MÁX',
  next: 'Siguiente',
  xpToNext: '{n} XP para el nivel {l}',
  path: 'Camino de descubrimiento',
  codexSub: '{a} / {b} descubiertos',
  tabs: { weapon: 'Armas', drone: 'Drones', card: 'Cartas', class: 'Clases', arena: 'Arenas', powerup: 'Potenciadores', elite: 'Élites', enemy: 'Enemigos', boss: 'Jefes' },
  discovered: 'Descubierto',
  openedUnmet: 'Abierto, aún no visto',
  lockedLevel: 'Nivel {n}',
  lockedAch: 'Logro',
  noteNew: '¡Nuevo!',
  packTap: 'Toca para abrir',
  openAll: 'Abrir todo',
  added: 'Añadido al álbum',
  cornerAdded: 'Añadido al álbum',
  pack: 'Paquete de cartas',
  introTitle: 'Una nueva forma de progresar',
  introOk: 'Entendido',
};

const FR: Partial<Record<keyof MetaWords, unknown>> = {
  xpCompanions: 'XP réduite par les compagnons (x{f})',
  level: 'Niveau',
  levelShort: 'Niv',
  max: 'MAX',
  next: 'Suivant',
  xpToNext: '{n} XP pour le niveau {l}',
  path: 'Chemin de découverte',
  codexSub: '{a} / {b} découverts',
  tabs: { weapon: 'Armes', drone: 'Drones', card: 'Cartes', class: 'Classes', arena: 'Arènes', powerup: 'Bonus', elite: 'Élites', enemy: 'Ennemis', boss: 'Boss' },
  discovered: 'Découvert',
  openedUnmet: 'Ouvert, pas encore vu',
  lockedLevel: 'Niveau {n}',
  lockedAch: 'Succès',
  noteNew: 'Nouveau !',
  packTap: 'Touchez pour ouvrir',
  openAll: 'Tout ouvrir',
  added: "Ajouté à l'album",
  cornerAdded: "Ajouté à l'album",
  pack: 'Paquet de cartes',
  introTitle: 'Une nouvelle progression',
  introOk: 'Compris',
};

const RU: Partial<Record<keyof MetaWords, unknown>> = {
  xpCompanions: 'Опыт уменьшен из-за напарников (x{f})',
  level: 'Уровень',
  levelShort: 'Ур.',
  max: 'МАКС',
  next: 'Далее',
  xpToNext: '{n} XP до уровня {l}',
  path: 'Путь открытий',
  codexSub: 'Открыто {a} из {b}',
  tabs: { weapon: 'Оружие', drone: 'Дроны', card: 'Карты', class: 'Классы', arena: 'Арены', powerup: 'Усиления', elite: 'Элиты', enemy: 'Враги', boss: 'Боссы' },
  discovered: 'Открыто',
  openedUnmet: 'Доступно, ещё не встречено',
  lockedLevel: 'Уровень {n}',
  lockedAch: 'Достижение',
  noteNew: 'Новое!',
  packTap: 'Нажмите, чтобы открыть',
  openAll: 'Открыть все',
  added: 'Добавлено в альбом',
  cornerAdded: 'Добавлено в альбом',
  pack: 'Набор карт',
  introTitle: 'Новая система прогресса',
  introOk: 'Понятно',
};

const OVER: Record<Lang, Partial<Record<keyof MetaWords, unknown>>> = { en: {}, tr: TR, de: DE, es: ES, fr: FR, ru: RU };

/** The words for a language: its own where translated, English elsewhere. */
export function metaWords(lang: Lang): MetaWords {
  const over = OVER[lang] ?? {};
  const out: Record<string, unknown> = { ...EN, ...over };
  out.tabs = { ...EN.tabs, ...((over.tabs as object) ?? {}) };
  return out as MetaWords;
}

/** Fill the `{x}` places of a string. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}
