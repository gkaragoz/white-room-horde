import { POWERS } from './render/power';
import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, FloorPhase, MISC, CARD_IDS, CARD_RARITY, PERSONAL_CARDS, MAPS, MAX_ENEMIES, MAX_PICKUPS, MAX_PLAYERS, PLAYER_COLORS, PERK, PERKS, PlayerState, TICK_RATE, WEAPON_IDS, WEAPON_RANK, type WeaponId } from '@wrh/shared';
import { xpForNext, type World } from '@wrh/sim';
import { asset } from './assets';
import { ACTIONS } from './input';
import { THEMES } from './render/arena';
import { EXTRA } from './i18n';
import { renderControlsSheet, renderSettingsPanel } from './settingsPanel';
import { discoverRelay } from './relay';
import { Preview } from './render/preview';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, loadRejoin, saveProfile } from './profile';

export type Lang = 'en' | 'tr' | 'de' | 'es' | 'fr' | 'ru';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'ru', label: 'Русский' },
];

/** Layer a partial translation over a complete one (objects merge key by key, everything else is replaced). */
function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over) || typeof base !== 'object' || base === null || Array.isArray(base)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge((base as Record<string, unknown>)[k], v);
  return out as T;
}

const BASE_STRINGS = {
  en: {
    title: 'white-room-horde',
    tag: 'co-op horde survival',
    name: 'Your name',
    solo: 'Play solo',
    host: 'Host game',
    join: 'Join game',
    code: 'Room code',
    server: 'Server',
    start: 'Start game',
    leave: 'Leave',
    waiting: 'Waiting for the host to start...',
    players: 'Players',
    host_tag: 'host',
    wave: 'Floor',
    nextWave: 'Next floor in',
    enemiesLeft: 'left',
    waveCleared: 'FLOOR CLEARED',
    breather: 'Catch your breath',
    climbIn: 'Climbing in',
    climbing: 'Climbing...',
    getReady: 'Get ready',
    arrivedTitle: 'Floor',
    kills: 'Kills',
    level: 'Level',
    boss: 'BOSS',
    downed: 'You are down!',
    downedHint: 'A teammate can revive you (hold E near you)',
    revive: 'Hold E to revive',
    dead: 'You are dead',
    over: 'Game over',
    reached: 'Reached wave',
    again: 'Play again',
    paused: 'Paused',
    resume: 'Resume',
    replay: 'Save replay',
    pick: 'Level up! Pick a card',
    rarity: ['Common', 'Rare', 'Epic'],
    onlyYou: 'Only you',
    settings: 'Settings',
    volume: 'Volume',
    music: 'Music',
    shadows: 'Shadows',
    renderer: 'Renderer (WebGPU falls back to WebGL2 if unavailable)',
    aa: 'Anti-aliasing',
    reloads: 'reloads the page',
    bounce: 'Bounce light (fake GI)',
    timeOfDay: 'Time of day',
    day: 'Day',
    night: 'Night',
    cycle: 'Day and night',
    dynLights: 'Real-time lights (flashes, explosions, lamps)',
    weather: 'Rain',
    hostPaused: 'Paused by the host',
    hostResume: 'Press P to resume',
    colorblind: 'Colour-blind mode',
    textSize: 'Text size',
    on: 'On',
    quality: 'Render scale',
    language: 'Language',
    close: 'Close',
    off: 'Off',
    low: 'Low',
    high: 'High',
    desync: 'Desync detected!',
    connecting: 'Connecting...',
    controls: 'WASD move · auto aim · click fire · R reload · 1-9 / Q weapons · Shift dash · right-click grenade at the cursor · E revive · 1-3 cards',
    weapon: 'Starting weapon',
    arena: 'Arena',
    difficulty: 'Difficulty',
    look: 'Look',
    relayLooking: 'Looking for the online server...',
    relayOnline: 'Online server found',
    relayOffline: 'No online server is up right now: solo works, or paste an address above.',
    invite: 'Copy invite link',
    inviteCopied: 'Link copied! Send it to your friends.',
    invited: 'You were invited to room',
    invitedHint: 'Type your name and press Join.',
    tabChar: 'Character',
    tabWeapon: 'Weapon',
    colorAuto: 'Colour',
    statDmg: 'Damage',
    statRate: 'Rate',
    statMag: 'Magazine',
    statRange: 'Range',
    statAcc: 'Accuracy',
    switched: 'Out of ammo, switched to',
    newWeapon: 'New weapon',
    backToMain: 'Ammo found, back to',
    sidearm: 'Sidearm',
    statReload: 'Reload',
    statPierce: 'Pierce',
    statBlast: 'Blast',
    statDps: 'DPS',
    statAmmo: 'Reserve',
    password: 'Room password (optional)',
    rejoin: 'Rejoin the game you left',
    lockedTip: 'Reach wave',
    best: 'Best',
    newBest: 'New record!',
    unlockedWeapon: 'Unlocked',
    reconnecting: 'Connection lost, reconnecting...',
    syncing: 'Catching up with the game...',
    powerNames: ['Damage', 'Fire rate', 'Piercing', 'Crit chance', 'Blast radius', 'Move speed', 'Max health', 'Armor', 'Magnet', 'Luck', 'XP gain', 'Revive speed', 'Reload speed', 'Dash cooldown', 'Lifesteal'],
    joining: 'Joining the game in progress...',
    loading: 'Loading',
    maps: { '-1': 'Random', '0': 'Warehouse', '1': 'Courtyard', '2': 'Corridors', '3': 'Open field', '4': 'Ruins', '5': 'Factory' },
    diffs: ['Easy', 'Normal', 'Hard'],
    accs: ['Bandana', 'Cap', 'Goggles', 'Headphones', 'Helmet', 'Crown', 'Devil horns', 'Top hat', 'Cowboy hat', 'Ninja band', 'Mohawk', 'Bunny ears', 'Cyber visor', 'Pirate hat', 'Wizard hat', 'Viking helmet', 'Santa hat', 'Chef hat', 'Astronaut', 'Cat ears', 'Halo', 'Alien antennae', 'Gas mask', 'Beanie', 'Samurai helmet', 'Shades', 'Flower crown'],
    controlsTitle: 'Controls',
    pressKey: 'press a key...',
    resetKeys: 'Reset keys',
    actions: { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', fire: 'Fire', grenade: 'Grenade', revive: 'Revive', reload: 'Reload', dash: 'Dash', switch: 'Switch weapon', hostpause: 'Pause (host)', card1: 'Card 1', card2: 'Card 2', card3: 'Card 3', pause: 'Pause' },
    fpsCap: 'Frame limit',
    unlimited: 'Display rate',
    texture: 'Texture detail',
    autoScale: 'Auto resolution',
    noServer: 'Enter the server address first',
    noConnect: 'Could not connect to',
    connLost: 'Connection lost',
    ammo: 'Ammo',
    reloading: 'Reloading...',
    dashReady: 'Dash',
    grenades: 'Grenades',
    cards: {
      damage: ['Heavy rounds', '+15% damage for everyone'],
      rate: ['Quick fingers', '+12% fire rate for everyone'],
      speed: ['Running shoes', '+8% move speed for everyone'],
      hp: ['Thick vests', '+20 max HP for everyone'],
      pierce: ['Piercing tips', 'Bullets pass through +1 enemy'],
      arsenal: ['New toys', 'Everyone upgrades to the next weapon'],
      heal: ['First aid', 'Heal everyone to full'],
      sharp: ['Sharpshooter', '+30% damage for you only'],
      sprint: ['Sprinter', '+20% move speed for you only'],
      bulk: ['Bulk up', '+40 max HP for you only'],
      ammo: ['Full magazines', 'Everyone refills magazine and reserve'],
      grenades: ['Grenade crate', '+2 grenades for everyone'],
      medic: ['Field medics', 'Revive 30% faster'],
      magnet: ['Loot magnet', 'Pickups fly to you from further away'],
      luck: ['Lucky clover', '+50% loot drops'],
      scholar: ['Quick study', '+25% XP for the team'],
      blast: ['Big bang', 'Grenades +25% radius and damage'],
      quickhands: ['Quick hands', 'Reload 25% faster'],
      roll: ['Roll with it', 'Dash recharges 30% faster'],
      armor: ['Padded vests', 'Everyone takes 12% less damage'],
      crit: ['Critical hits', '10% chance of double damage'],
      vampire: ['Vampire', 'You heal 3 HP per kill'],
      tempo: ['Tempo', '+25% fire rate for you only'],
      marksman: ['Marksman', 'Your bullets pierce 2 more enemies'],
      ironskin: ['Iron skin', 'You take 20% less damage'],
      regen: ['Regeneration', 'You heal 1.6 HP per second'],
      thorns: ['Thorns', 'Enemies that hit you take 16 damage'],
      shock: ['Shockwave', 'Your dash blasts and shoves enemies around you'],
      volatile: ['Volatile rounds', '18% of your kills explode'],
      frost: ['Frost aura', 'Enemies near you move 35% slower'],
      scavenger: ['Scavenger', 'Kills sometimes refill 2 rounds'],
      adrenaline: ['Adrenaline', 'Every kill gives a burst of speed'],
      barrier: ['Barrier', 'A 45 point shield that recharges'],
      secondwind: ['Second wind', 'Once: get back up at half health instead of going down'],
      rage: ['Rage', 'Up to 70% more damage as your health drops'],
    },
    classNames: ['Soldier', 'Medic', 'Heavy', 'Scout', 'Demolisher', 'Ranger', 'Berserker'],
    classTips: [
      'Balanced all-rounder',
      'Heals nearby allies, revives 80% faster, regenerates',
      '+90 HP and 22% less damage taken, but slow',
      'Very fast and dashes often, but fragile',
      '3 extra grenades and 50% bigger blasts',
      '+15% damage, bullets pierce one more enemy',
      'Hits harder as health drops, heals on kills',
    ],
    classTitle: 'Class',
    waveMods: ['', 'Swarm!', 'Armored horde!', 'Fast and furious!', 'Bounty wave!', 'Elite storm!'],
    waveModTips: ['', 'Many weaker enemies', 'Enemies are tougher', 'Enemies run faster', 'Twice the loot', 'Many elite enemies'],
    elites: ['', 'Giant', 'Swift', 'Splitter', 'Volatile', 'Regenerating', 'Armored'],
    powerups: ['Ammo', 'Health', 'Grenade', 'Weapon', 'Shield', 'Haste', 'Quad damage', 'NUKE', 'Time freeze'],
    combos: ['Killing spree!', 'Rampage!', 'Unstoppable!', 'Massacre!', 'Godlike!', 'Apocalypse!'],
    secondWind: 'Second wind!',
    mvp: 'MVP',
    squadKills: 'Kills',
    weapons: { pistol: 'Pistol', smg: 'SMG', ar: 'Assault rifle', shotgun: 'Shotgun', hmg: 'Heavy MG', minigun: 'Minigun', sniper: 'Sniper', revolver: 'Revolver', mp: 'Machine pistol', dbl: 'Double barrel', dmr: 'Marksman rifle', flamer: 'Flamethrower', gl: 'Grenade launcher' },
  },
  tr: {
    title: 'white-room-horde',
    tag: 'co-op sürü hayatta kalma',
    name: 'Adın',
    solo: 'Tek başına oyna',
    host: 'Oda kur',
    join: 'Odaya katıl',
    code: 'Oda kodu',
    server: 'Sunucu',
    start: 'Oyunu başlat',
    leave: 'Ayrıl',
    waiting: 'Host oyunu başlatana kadar bekleniyor...',
    players: 'Oyuncular',
    host_tag: 'host',
    wave: 'Kat',
    nextWave: 'Sonraki kat',
    enemiesLeft: 'kaldı',
    waveCleared: 'KAT TEMİZLENDİ',
    breather: 'Nefes al',
    climbIn: 'Yükselmeye',
    climbing: 'Yükseliyor...',
    getReady: 'Hazırlan',
    arrivedTitle: 'Kat',
    kills: 'Öldürme',
    level: 'Seviye',
    boss: 'BOSS',
    downed: 'Yere düştün!',
    downedHint: 'Bir takım arkadaşı seni kaldırabilir (yanında E basılı tut)',
    revive: 'Kaldırmak için E basılı tut',
    dead: 'Öldün',
    over: 'Oyun bitti',
    reached: 'Ulaşılan dalga',
    again: 'Tekrar oyna',
    paused: 'Duraklatıldı',
    resume: 'Devam et',
    replay: 'Tekrarı kaydet',
    pick: 'Seviye atladın! Bir kart seç',
    rarity: ['Yaygın', 'Nadir', 'Efsanevi'],
    onlyYou: 'Sadece sen',
    settings: 'Ayarlar',
    volume: 'Ses',
    music: 'Müzik',
    shadows: 'Gölgeler',
    renderer: 'Çizim motoru (WebGPU yoksa WebGL2 kullanılır)',
    aa: 'Kenar yumuşatma',
    reloads: 'sayfayı yeniler',
    bounce: 'Sekme ışığı (sahte GI)',
    timeOfDay: 'Günün saati',
    day: 'Gündüz',
    night: 'Gece',
    cycle: 'Gece gündüz döngüsü',
    dynLights: 'Gerçek zamanlı ışıklar (namlu, patlama, lamba)',
    weather: 'Yağmur',
    hostPaused: 'Oyun host tarafından durduruldu',
    hostResume: 'Devam etmek için P',
    colorblind: 'Renk körü modu',
    textSize: 'Yazı boyutu',
    on: 'Açık',
    quality: 'Çözünürlük ölçeği',
    language: 'Dil',
    close: 'Kapat',
    off: 'Kapalı',
    low: 'Düşük',
    high: 'Yüksek',
    desync: 'Senkron bozuldu!',
    connecting: 'Bağlanıyor...',
    controls: 'WASD hareket · otomatik nişan · tık ateş · R doldur · 1-9 / Q silahlar · Shift atıl · sağ tık imlece bomba · E kaldır · 1-3 kart',
    weapon: 'Başlangıç silahı',
    arena: 'Arena',
    difficulty: 'Zorluk',
    look: 'Görünüm',
    relayLooking: 'Çevrimiçi sunucu aranıyor...',
    relayOnline: 'Çevrimiçi sunucu bulundu',
    relayOffline: 'Şu an çevrimiçi sunucu yok: tek başına oynayabilir ya da yukarıya adres yapıştırabilirsin.',
    invite: 'Davet linkini kopyala',
    inviteCopied: 'Link kopyalandı! Arkadaşlarına gönder.',
    invited: 'Şu odaya davet edildin:',
    invitedHint: 'Adını yaz ve Katıl\'a bas.',
    tabChar: 'Karakter',
    tabWeapon: 'Silah',
    colorAuto: 'Renk',
    statDmg: 'Hasar',
    statRate: 'Hız',
    statMag: 'Şarjör',
    statRange: 'Menzil',
    statAcc: 'İsabet',
    switched: 'Mermi bitti, geçildi:',
    newWeapon: 'Yeni silah',
    backToMain: 'Mermi bulundu, dönüldü:',
    sidearm: 'Yedek silah',
    statReload: 'Doldurma',
    statPierce: 'Delme',
    statBlast: 'Patlama',
    statDps: 'DPS',
    statAmmo: 'Yedek',
    password: 'Oda şifresi (isteğe bağlı)',
    rejoin: 'Ayrıldığın oyuna geri dön',
    lockedTip: 'Şu dalgaya ulaş:',
    best: 'En iyi',
    newBest: 'Yeni rekor!',
    unlockedWeapon: 'Açıldı',
    reconnecting: 'Bağlantı koptu, yeniden bağlanıyor...',
    syncing: 'Oyuna yetişiliyor...',
    powerNames: ['Hasar', 'Ateş hızı', 'Delme', 'Kritik şansı', 'Patlama alanı', 'Hareket hızı', 'Azami can', 'Zırh', 'Mıknatıs', 'Şans', 'XP kazancı', 'Kaldırma hızı', 'Doldurma hızı', 'Atılma bekleme', 'Can çalma'],
    joining: 'Devam eden oyuna katılınıyor...',
    loading: 'Yükleniyor',
    maps: { '-1': 'Rastgele', '0': 'Depo', '1': 'Avlu', '2': 'Koridorlar', '3': 'Açık alan', '4': 'Harabe', '5': 'Fabrika' },
    diffs: ['Kolay', 'Normal', 'Zor'],
    accs: ['Bandana', 'Şapka', 'Gözlük', 'Kulaklık', 'Kask', 'Taç', 'Şeytan boynuzu', 'Silindir şapka', 'Kovboy şapkası', 'Ninja bandı', 'Mohawk', 'Tavşan kulağı', 'Siber vizör', 'Korsan şapkası', 'Büyücü şapkası', 'Viking miğferi', 'Noel şapkası', 'Aşçı şapkası', 'Astronot', 'Kedi kulağı', 'Hale', 'Uzaylı anteni', 'Gaz maskesi', 'Bere', 'Samuray kaskı', 'Güneş gözlüğü', 'Çiçek tacı'],
    controlsTitle: 'Kontroller',
    pressKey: 'bir tuşa bas...',
    resetKeys: 'Tuşları sıfırla',
    actions: { up: 'Yukarı', down: 'Aşağı', left: 'Sola', right: 'Sağa', fire: 'Ateş', grenade: 'El bombası', revive: 'Kaldır', reload: 'Doldur', dash: 'Atıl', switch: 'Silah değiştir', hostpause: 'Duraklat (host)', card1: 'Kart 1', card2: 'Kart 2', card3: 'Kart 3', pause: 'Duraklat' },
    fpsCap: 'Kare sınırı',
    unlimited: 'Ekran hızı',
    texture: 'Doku detayı',
    autoScale: 'Otomatik çözünürlük',
    noServer: 'Önce sunucu adresini gir',
    noConnect: 'Bağlanılamadı:',
    connLost: 'Bağlantı koptu',
    ammo: 'Mermi',
    reloading: 'Dolduruyor...',
    dashReady: 'Atılma',
    grenades: 'Bomba',
    cards: {
      damage: ['Ağır mermiler', 'Herkese +%15 hasar'],
      rate: ['Çevik parmaklar', 'Herkese +%12 ateş hızı'],
      speed: ['Koşu ayakkabısı', 'Herkese +%8 hız'],
      hp: ['Kalın yelekler', 'Herkese +20 azami can'],
      pierce: ['Delici uçlar', 'Mermiler +1 düşmanı deler'],
      arsenal: ['Yeni oyuncaklar', 'Herkes bir sonraki silaha geçer'],
      heal: ['İlk yardım', 'Herkesin canı tam dolar'],
      sharp: ['Keskin nişancı', 'Sadece sana +%30 hasar'],
      sprint: ['Koşucu', 'Sadece sana +%20 hız'],
      bulk: ['Kalın deri', 'Sadece sana +40 azami can'],
      ammo: ['Dolu şarjörler', 'Herkesin şarjörü ve yedeği dolar'],
      grenades: ['Bomba sandığı', 'Herkese +2 el bombası'],
      medic: ['Saha sağlıkçıları', 'Kaldırma %30 daha hızlı'],
      magnet: ['Ganimet mıknatısı', 'Kutular daha uzaktan sana uçar'],
      luck: ['Şans yoncası', '%50 daha çok ganimet'],
      scholar: ['Çabuk öğrenen', 'Takıma +%25 XP'],
      blast: ['Büyük patlama', 'El bombaları +%25 alan ve hasar'],
      quickhands: ['Çevik eller', '%25 daha hızlı doldurma'],
      roll: ['Yuvarlan', 'Atılma %30 daha hızlı dolar'],
      armor: ['Dolgulu yelekler', 'Herkes %12 daha az hasar alır'],
      crit: ['Kritik vuruşlar', '%10 ihtimalle çift hasar'],
      vampire: ['Vampir', 'Her öldürmede 3 can kazanırsın'],
      tempo: ['Tempo', 'Sadece sana +%25 ateş hızı'],
      marksman: ['Nişancı', 'Mermilerin 2 düşman daha deler'],
      ironskin: ['Demir deri', 'Sadece sen %20 daha az hasar alırsın'],
      regen: ['Yenilenme', 'Saniyede 1,6 can yenilersin'],
      thorns: ['Dikenler', 'Sana vuran düşman 16 hasar alır'],
      shock: ['Şok dalgası', 'Atılman çevrendeki düşmanları patlatıp savurur'],
      volatile: ['Patlayıcı mermiler', 'Öldürmelerinin %18\'i patlar'],
      frost: ['Don alanı', 'Yakınındaki düşmanlar %35 yavaşlar'],
      scavenger: ['Leşçi', 'Öldürmeler bazen 2 mermi doldurur'],
      adrenaline: ['Adrenalin', 'Her öldürme kısa bir hız verir'],
      barrier: ['Bariyer', 'Kendini dolduran 45 puanlık kalkan'],
      secondwind: ['İkinci nefes', 'Bir kez: yere düşmek yerine yarı canla ayağa kalk'],
      rage: ['Öfke', 'Canın azaldıkça %70\'e kadar fazla hasar'],
    },
    classNames: ['Asker', 'Sağlıkçı', 'Ağır', 'Gözcü', 'Yıkımcı', 'Avcı', 'Çılgın'],
    classTips: [
      'Dengeli, her işe yarar',
      'Yakındaki dostları iyileştirir, %80 hızlı kaldırır, yenilenir',
      '+90 can, %22 az hasar, ama yavaş',
      'Çok hızlı, sık atılır, ama kırılgan',
      '3 fazladan bomba, %50 büyük patlama',
      '%15 fazla hasar, mermi bir düşman daha deler',
      'Canı azaldıkça sert vurur, öldürünce iyileşir',
    ],
    classTitle: 'Sınıf',
    waveMods: ['', 'Sürü!', 'Zırhlı sürü!', 'Hızlı ve öfkeli!', 'Ganimet dalgası!', 'Elit fırtınası!'],
    waveModTips: ['', 'Çok sayıda zayıf düşman', 'Düşmanlar daha dayanıklı', 'Düşmanlar daha hızlı', 'İki kat ganimet', 'Çok sayıda elit düşman'],
    elites: ['', 'Dev', 'Çevik', 'Bölünen', 'Patlayıcı', 'Yenilenen', 'Zırhlı'],
    powerups: ['Mermi', 'Can', 'Bomba', 'Silah', 'Kalkan', 'Hız', 'Dörtlü hasar', 'NÜKLEER', 'Zaman dondurma'],
    combos: ['Öldürme serisi!', 'Çılgınlık!', 'Durdurulamaz!', 'Katliam!', 'Tanrısal!', 'Kıyamet!'],
    secondWind: 'İkinci nefes!',
    mvp: 'MVP',
    squadKills: 'Öldürme',
    weapons: { pistol: 'Tabanca', smg: 'SMG', ar: 'Piyade tüfeği', shotgun: 'Pompalı', hmg: 'Ağır MG', minigun: 'Minigun', sniper: 'Keskin nişancı', revolver: 'Revolver', mp: 'Makineli tabanca', dbl: 'Çift namlulu', dmr: 'Nişancı tüfeği', flamer: 'Alev makinesi', gl: 'Bombaatar' },
  },
} as const;

type StringSet = (typeof BASE_STRINGS)['en'];
/** Every interface language, complete: translations that are missing fall back to English. */
export const UI_STRINGS: Record<Lang, StringSet> = {
  en: BASE_STRINGS.en,
  tr: BASE_STRINGS.tr as unknown as StringSet,
  de: merge(BASE_STRINGS.en, EXTRA.de),
  es: merge(BASE_STRINGS.en, EXTRA.es),
  fr: merge(BASE_STRINGS.en, EXTRA.fr),
  ru: merge(BASE_STRINGS.en, EXTRA.ru),
};

export interface UiHandlers {
  onSolo(name: string): void;
  onHost(name: string, server: string, password: string): void;
  onJoin(name: string, code: string, server: string, password: string): void;
  onRejoin(): void;
  onWeapon(weapon: WeaponId): void;
  onLook(acc: number, color: number, cls: number): void;
  getBindings(): Record<string, string[]>;
  onRebind(action: string, done: () => void): void;
  onResetKeys(): void;
  onOptions(map: number, difficulty: number): void;
  onStart(): void;
  onLeave(): void;
  onCard(index: number): void;
  onAgain(): void;
  onResume(): void;
  onReplay(): void;
  onUiSound(name: 'click' | 'confirm' | 'back' | 'error' | 'open' | 'close'): void;
  onSetting(key: keyof Settings, value: number | string | boolean): void;
  onResetSettings(): void;
}

export interface Settings {
  /** Frame limit: 0 = as fast as the display goes (vsync). */
  fpsCap: 0 | 30 | 60 | 120;
  texture: 0 | 1;
  autoScale: boolean;
  music: number;
  renderer: 'webgl' | 'webgpu';
  aa: 'off' | 'msaa' | 'smaa';
  bounce: boolean;
  /** Time of day: always day, always night, or a day/night cycle that follows the waves. */
  time: 'day' | 'night' | 'cycle';
  /** Real-time lights: muzzle flashes, explosions, street lamps, flashlight. */
  dynLights: boolean;
  /** Rain on some night waves. */
  weather: boolean;
  /** Colour-blind safe player colours and numbered name tags. */
  colorblind: boolean;
  /** Menu and HUD text size: 0 normal, 1 larger, 2 largest. */
  textSize: 0 | 1 | 2;
  /** Screen shake strength (1 = default). */
  shake: number;
  hitStop: boolean;
  damageNumbers: boolean;
  announcer: boolean;
  /** Aim at the nearest enemy or barrel by itself; the cursor still steers grenades. */
  autoAim: boolean;
  ammoRing: boolean;
  nameTags: boolean;
  minimap: boolean;
  showFps: boolean;
  /** Particle amount, blood and gibs, and how long corpses stay: 0 low, 1 normal, 2 high. */
  particles: 0 | 1 | 2;
  gore: 0 | 1 | 2;
  corpseTime: 0 | 1 | 2;
  sfxVolume: number;
  voiceVolume: number;
  uiSounds: boolean;
  volume: number;
  shadows: 0 | 1 | 2;
  scale: number;
  lang: Lang;
}

const CSS = `
.wrh-ui{position:fixed;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#3a352d}
.wrh-ui *{box-sizing:border-box}
.wrh-panel,.wrh-top,.wrh-me,.wrh-squad,.wrh-inv{zoom:var(--wrh-zoom,1)}
.wrh-panel{pointer-events:auto;background:rgba(250,244,232,.95);border:2px solid #cdbfa5;border-radius:14px;padding:18px 22px;box-shadow:0 8px 30px rgba(60,45,20,.25)}
.wrh-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:300px;max-width:92vw}
.wrh-ui h1{margin:0 0 2px;font-size:28px;letter-spacing:.5px}
.wrh-ui .sub{margin:0 0 14px;opacity:.7;font-size:13px}
.wrh-ui input{width:100%;padding:8px 10px;margin:4px 0 10px;border:2px solid #cdbfa5;border-radius:8px;font-size:15px;background:#fffdf8;color:#3a352d}
.wrh-ui label{font-size:12px;opacity:.75;display:block}
.wrh-ui button{pointer-events:auto;cursor:pointer;border:0;border-radius:9px;padding:10px 14px;font-size:15px;font-weight:600;background:#1fa2ff;color:#fff;margin:3px 4px 3px 0}
.wrh-ui button.alt{background:#8e9aaf}
.wrh-ui button.warn{background:#e0524a}
.wrh-ui button:hover{filter:brightness(1.08)}
.wrh-weapons{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px}
.wrh-ui button.wrh-wp{background:#e6dcc8;color:#3a352d;font-size:12px;padding:6px 9px;margin:0;border:2px solid transparent}
.wrh-ui button.wrh-wp.on{background:#fff;border-color:#1fa2ff}
.wrh-prev{display:flex;flex-direction:column;align-items:center;margin:2px 0 8px}
.wrh-tabs{display:flex;gap:4px;margin-bottom:6px}
.wrh-stage{display:flex;align-items:center;gap:4px}
.wrh-canvas{width:230px;height:230px;border-radius:12px;background:radial-gradient(circle at 50% 38%,#fffdf8,#e9e0cd);border:2px solid #cdbfa5;overflow:hidden}
.wrh-canvas canvas{display:block;touch-action:none;cursor:grab}
.wrh-ui button.wrh-arrow{width:38px;height:56px;padding:0;margin:0;font-size:18px;background:#e6dcc8;color:#3a352d}
.wrh-prev-name{font-weight:800;font-size:16px;margin-top:6px}
.wrh-prev-stats{font-size:12px;min-height:16px;width:100%;max-width:300px}
.wrh-stat{display:flex;align-items:center;gap:6px;margin:2px 0}
.wrh-stat .ic{width:18px;text-align:center}
.wrh-stat .nm{width:68px;font-weight:600;opacity:.8}
.wrh-stat .bar{flex:1;height:8px;border-radius:5px;background:rgba(60,45,20,.18);overflow:hidden}
.wrh-stat .bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#1fa2ff,#6fd0ff)}
.wrh-stat b{width:54px;text-align:right}
.wrh-swatches{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-top:6px;max-width:300px}
.wrh-ui button.wrh-sw{width:24px;height:24px;padding:0;margin:0;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px #8888}
.wrh-ui button.wrh-sw.on{box-shadow:0 0 0 3px #1fa2ff}
.wrh-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wrh-plist{margin:8px 0;padding:0;list-style:none}
.wrh-plist li{display:flex;align-items:center;gap:8px;padding:3px 0}
.wrh-dot{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #8888}
.wrh-top{position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center;font-weight:700;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.wrh-top .big{font-size:22px}
.wrh-bar{height:10px;border-radius:6px;background:rgba(60,45,20,.2);overflow:hidden;margin:4px auto 0;width:260px}
.wrh-bar>i{display:block;height:100%;background:#1fa2ff;width:0}
.wrh-bar.boss{width:420px;height:14px}
.wrh-bar.boss>i{background:#d8362e}
.wrh-squad{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:7px;max-width:260px}
.wrh-pc{width:196px;padding:6px 9px 7px;border-radius:12px;background:rgba(251,246,234,.82);border:1.5px solid rgba(43,58,82,.18);border-left:4px solid var(--pc);box-shadow:0 2px 8px rgba(20,28,44,.18);backdrop-filter:blur(2px);font-size:12px;font-weight:600;color:#2b3a52}
.wrh-pc.me{width:230px;padding:8px 11px 9px;font-size:13px}
.wrh-pc .top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.wrh-pc .top b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}
.wrh-pc .top em{font-style:normal;font-variant-numeric:tabular-nums;font-weight:800;font-size:1.12em}
.wrh-pc .top em small{font-size:.78em;font-weight:600;opacity:.6}
.wrh-pc .bar{position:relative;height:11px;border-radius:6px;background:rgba(30,40,58,.3);box-shadow:inset 0 1px 2px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.35);overflow:hidden}
.wrh-pc.me .bar{height:14px;border-radius:7px}
.wrh-pc .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;transition:width .18s ease-out;box-shadow:inset 0 -3px 4px rgba(0,0,0,.18),inset 0 2px 2px rgba(255,255,255,.4)}
.wrh-pc .bar s{position:absolute;left:0;top:0;height:35%;border-radius:inherit;background:linear-gradient(180deg,#bfe4ff,#5aa6ff);box-shadow:0 0 0 .5px rgba(20,60,120,.5);transition:width .18s}
.wrh-pc.low .bar i{animation:wrh-lowhp .7s ease-in-out infinite alternate}
@keyframes wrh-lowhp{to{filter:brightness(1.35)}}
.wrh-pc .chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
.wrh-pc .chip{display:inline-flex;align-items:center;gap:3px;padding:1px 6px 1px 2px;border-radius:9px;background:rgba(43,58,82,.1);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent);font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;line-height:15px}
.wrh-pc .chip i{display:inline-block;min-width:15px;height:15px;border-radius:50%;background:var(--c);color:#12202f;font-style:normal;text-align:center;font-size:10px;line-height:15px;text-shadow:0 0 1px rgba(255,255,255,.5)}
.wrh-pc .chip.timed{animation:wrh-lowhp .5s ease-in-out infinite alternate}
.wrh-pc:not(.me) .chips{margin-top:4px}
.wrh-pc:not(.me) .chip{font-size:9.5px}
.wrh-me{position:absolute;right:14px;bottom:12px;text-align:right;font-weight:700;font-size:15px;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.wrh-hurt{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(200,20,30,0) 45%,rgba(200,20,30,.55) 100%);opacity:0}
.wrh-banner{position:absolute;left:50%;top:26%;transform:translateX(-50%);text-align:center;font-weight:800;font-size:30px;color:#c8242c;text-shadow:0 2px 0 #fff,0 0 18px rgba(255,255,255,.8)}
.wrh-banner small{display:block;font-size:14px;color:#3a352d;font-weight:600}
.wrh-cards{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);text-align:center;pointer-events:none;width:max-content;max-width:98vw;white-space:nowrap}
@media (max-width:640px){.wrh-card{width:29vw!important;margin:0 3px!important}.wrh-card .art{height:70px!important}.wrh-card span{font-size:10px!important}}
.wrh-cards h3{margin:0 0 8px;text-shadow:0 1px 0 #fff}
.wrh-card{white-space:normal;pointer-events:auto;cursor:pointer;display:inline-block;position:relative;width:176px;vertical-align:top;margin:0 6px;padding:8px 10px 10px;background:#fffaf0;border:3px solid #8aa0b6;border-radius:14px;box-shadow:0 6px 18px rgba(60,45,20,.3);text-align:left;transition:transform .12s}
.wrh-card:hover{transform:translateY(-6px) scale(1.03)}
.wrh-card .art{height:104px;margin:0 -2px 6px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#fdf6e6,#dfe6ee)}
.wrh-card .art img{max-height:100px;max-width:100%;filter:drop-shadow(0 3px 2px rgba(60,45,20,.3))}
.wrh-card b{display:block;font-size:15px;margin-top:2px}
.wrh-card span{display:block;font-size:12px;opacity:.85;min-height:30px}
.wrh-card em{display:block;margin-top:5px;font-size:10px;font-style:normal;font-weight:800;letter-spacing:.6px;text-transform:uppercase;opacity:.75}
.wrh-card.r1{border-color:#9a63ff}
.wrh-card.r1 .art{background:radial-gradient(circle at 50% 40%,#f6efff,#d9c8f5)}
.wrh-card.r2{border-color:#ff9a1f;box-shadow:0 0 0 2px #ffd97a,0 8px 22px rgba(255,150,30,.45)}
.wrh-card.r2 .art{background:radial-gradient(circle at 50% 40%,#fff5d6,#ffd48a)}
.wrh-card kbd{position:absolute;right:8px;top:8px;z-index:1;background:#1fa2ff;color:#fff;border-radius:5px;padding:0 6px;font-size:12px}
.wrh-cardtime{width:200px;height:6px;background:rgba(60,45,20,.2);border-radius:4px;margin:8px auto 0;overflow:hidden}
.wrh-cardtime>i{display:block;height:100%;background:#ff9a3a}
.wrh-hostpause{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);display:none;text-align:center;font-size:30px;font-weight:900;color:#fff;background:rgba(25,30,42,.72);padding:14px 30px;border-radius:16px;pointer-events:none;text-shadow:0 2px 0 #000}
.wrh-hostpause small{display:block;font-size:14px;font-weight:600;opacity:.85;margin-top:4px}
.wrh-ui.no-minimap .wrh-mini{display:none}
/* layers: labels that follow things in the world sit under the HUD, the HUD under menus, menus under settings */
.wrh-plabel,.wrh-ammo,.wrh-tag,.wrh-ring,.wrh-arrow-off,.wrh-dmg,.wrh-combo{z-index:1}
.wrh-top,.wrh-me,.wrh-squad,.wrh-mini,.wrh-inv,.wrh-cards,.wrh-banner,.wrh-gear,.wrh-warn,.wrh-hint{z-index:5}
.wrh-hostpause{z-index:8}
.wrh-center{z-index:20}
.wrh-ui.no-tags .wrh-tag{display:none}
.wrh-set{position:absolute;inset:0;z-index:40;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(20,26,38,.45);backdrop-filter:blur(2px)}
.wrh-set-panel{width:min(640px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#faf4e8;border:2px solid #cdbfa5;border-radius:16px;box-shadow:0 14px 50px rgba(30,24,10,.4);color:#3a352d;overflow:hidden}
.wrh-set-panel.wide{width:min(760px,95vw)}
.wrh-set-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 6px}
.wrh-set-head h2{margin:0;font-size:22px}
.wrh-set-x{background:none!important;color:#3a352d!important;font-size:30px!important;line-height:26px;padding:0 6px!important;margin:0!important}
.wrh-set-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px;border-bottom:2px solid #e6dcc8}
.wrh-ui .wrh-set-tabs button{background:none;color:#7a7060;border:0;border-bottom:3px solid transparent;border-radius:0;margin:0 0 -2px;padding:8px 12px;font-size:14px;font-weight:700}
.wrh-ui .wrh-set-tabs button.on{color:#1488e6;border-bottom-color:#1fa2ff}
.wrh-set-body{padding:6px 18px 12px;overflow-y:auto;min-height:220px}
.wrh-set-group{margin:14px 0 4px;padding-bottom:3px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8a7f6a;border-bottom:1px solid #e6dcc8}
.wrh-set-row{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;align-items:center;padding:7px 0;border-bottom:1px dashed rgba(205,191,165,.45)}
.wrh-set-row label{font-size:14px;font-weight:600}
.wrh-set-row label small{opacity:.6;font-weight:700}
.wrh-set-val{min-width:44px;text-align:right;font-size:13px;opacity:.75}
.wrh-set-row:has(.wrh-range){grid-template-columns:1fr 1.25fr 48px}
.wrh-range{width:100%;accent-color:#1fa2ff}
.wrh-seg{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.wrh-ui .wrh-seg button{background:#efe7d6;color:#3a352d;font-size:12px;font-weight:700;padding:5px 10px;margin:0;border:2px solid transparent;border-radius:8px}
.wrh-ui .wrh-seg button.on{background:#fff;border-color:#1fa2ff;color:#0e6fba}
.wrh-ui .wrh-switch{justify-self:end;position:relative;width:46px;height:26px;padding:0;margin:0;border-radius:13px;background:#cdbfa5;transition:background .15s}
.wrh-ui .wrh-switch i{position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.wrh-ui .wrh-switch.on{background:#1fa2ff}
.wrh-ui .wrh-switch.on i{left:23px}
.wrh-set-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 18px 14px;border-top:2px solid #e6dcc8}
.wrh-ui .wrh-set-foot button{background:#efe7d6;color:#3a352d;margin:0}
.wrh-ui .wrh-set-foot button.primary{background:#1fa2ff;color:#fff}
.wrh-set-note{margin:8px 0;font-size:13px;opacity:.75}
.wrh-set-keygrid{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;font-size:14px;font-weight:600}
.wrh-ui .wrh-set-keybtn{background:#efe7d6;color:#3a352d;margin:0;padding:4px 8px;border-radius:9px}
.wrh-ui .wrh-set-small{background:#efe7d6;color:#3a352d;font-size:12px;margin:10px 0 0}
.wrh-key{display:inline-block;min-width:30px;height:30px;line-height:26px;padding:0 8px;text-align:center;font:700 14px system-ui,sans-serif;color:#3a352d;background:linear-gradient(#fffdf8,#ece3cf);border:2px solid #b9ab8e;border-bottom-width:5px;border-radius:8px;box-shadow:0 2px 0 rgba(60,45,20,.25)}
.wrh-key.wide{padding:0 12px}
.wrh-key.pad{border-radius:50%;min-width:34px;background:linear-gradient(#f4f8ff,#dbe6f6);border-color:#8fa3bf;color:#25324a}
.wrh-keys-row{display:inline-flex;gap:4px;align-items:center}
.wrh-keys-row em,.wrh-ctl-mouse em{font-style:normal;opacity:.5;margin:0 4px}
.wrh-ctl-row{display:grid;grid-template-columns:minmax(200px,1fr) 1.3fr;gap:14px;align-items:center;padding:8px 0;border-bottom:1px dashed rgba(205,191,165,.5)}
.wrh-ctl-keys{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.wrh-ctl-desc b{display:block;font-size:15px}
.wrh-ctl-desc span{font-size:13px;opacity:.75}
.wrh-ctl-mouse{display:inline-flex;align-items:center;gap:6px}
.wrh-ctl-mouse small{font-size:11px;opacity:.7}
.wrh-padgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 16px;padding:6px 0}
.wrh-padcell{display:flex;align-items:center;gap:10px;font-size:14px}
@media (max-width:560px){.wrh-set-row,.wrh-ctl-row{grid-template-columns:1fr}.wrh-set-row:has(.wrh-range){grid-template-columns:1fr 48px}.wrh-set-row:has(.wrh-range) label{grid-column:1/-1}}
.wrh-gear{position:absolute;right:12px;top:10px;pointer-events:auto;cursor:pointer;width:34px;height:34px;border-radius:50%;background:rgba(250,244,232,.9);border:2px solid #cdbfa5;text-align:center;line-height:30px;font-size:18px}
.wrh-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);font-size:12px;opacity:.7;text-shadow:0 1px 0 #fff}
.wrh-count{position:absolute;left:50%;top:92px;transform:translateX(-50%);z-index:6;display:none;flex-direction:column;align-items:center;pointer-events:none;color:#fff;text-shadow:0 2px 0 rgba(20,28,44,.55),0 0 22px rgba(31,162,255,.7)}
.wrh-count b{font-size:26px;letter-spacing:.12em;font-weight:900}
.wrh-count i{font-style:normal;font-size:72px;line-height:1;font-weight:900;font-variant-numeric:tabular-nums}
.wrh-count i.pop{animation:wrh-countpop .5s cubic-bezier(.2,1.6,.4,1)}
.wrh-count small{font-size:14px;font-weight:700;opacity:.9;letter-spacing:.06em;text-transform:uppercase}
@keyframes wrh-countpop{from{transform:scale(1.7);opacity:.2}to{transform:scale(1);opacity:1}}
.wrh-loading{position:absolute;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(10,14,22,.55);backdrop-filter:blur(3px);pointer-events:none}
.wrh-loading .box{display:flex;flex-direction:column;align-items:center;gap:12px;min-width:240px;padding:22px 30px;border-radius:16px;background:rgba(251,246,234,.96);color:#2b3a52;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.wrh-loading i{width:38px;height:38px;border-radius:50%;border:4px solid rgba(43,58,82,.18);border-top-color:#1fa2ff;animation:wrh-spin .8s linear infinite}
.wrh-loading b{font-size:16px;letter-spacing:.02em}
.wrh-loading u{display:block;width:100%;height:8px;border-radius:5px;background:rgba(43,58,82,.15);overflow:hidden;text-decoration:none}
.wrh-loading s{display:block;height:100%;width:0;background:linear-gradient(90deg,#1fa2ff,#3ddc6a);transition:width .2s}
@keyframes wrh-spin{to{transform:rotate(360deg)}}
.wrh-warn{position:absolute;left:50%;top:60px;transform:translateX(-50%);color:#fff;background:#d8362e;padding:4px 12px;border-radius:8px;font-weight:700}
.wrh-mini{position:absolute;right:14px;bottom:52px;width:180px;height:120px;border:2px solid #cdbfa5;border-radius:8px;background:rgba(250,244,232,.78);box-shadow:0 3px 10px rgba(60,45,20,.25)}
.wrh-dmg{position:absolute;font-weight:800;font-size:15px;color:#fff;text-shadow:0 0 3px #7d0d14,0 0 3px #7d0d14,0 1px 0 #7d0d14;pointer-events:none;will-change:transform,opacity}
.wrh-menu{width:min(900px,94vw)}
.wrh-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 26px;align-items:start}
@media (max-width:820px){.wrh-cols{grid-template-columns:1fr}}
.wrh-logo{font-size:38px!important;letter-spacing:1px;text-align:center;background:linear-gradient(180deg,#2b3a52,#1fa2ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:0!important}
.wrh-menu .sub{text-align:center}
.wrh-arenas{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:4px 0 12px}
.wrh-ui button.wrh-arena{display:flex;flex-direction:column;gap:4px;align-items:center;padding:5px;margin:0;border-radius:11px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:12px;box-shadow:0 2px 5px rgba(60,45,20,.15);transition:transform .12s}
.wrh-ui button.wrh-arena:hover{transform:translateY(-2px)}
.wrh-ui button.wrh-arena.on{background:#fff;border-color:#1fa2ff;box-shadow:0 0 0 2px rgba(31,162,255,.25),0 4px 10px rgba(60,45,20,.2)}
.wrh-arena img,.wrh-arena .wrh-dice{width:100%;aspect-ratio:3/2;border-radius:7px;object-fit:cover;display:block}
.wrh-dice{display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#dfe4ea,#dfe4ea 8px,#d3dae2 8px,#d3dae2 16px);font-size:34px;font-weight:800;color:#7d8896}
.wrh-diffs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 12px}
.wrh-ui button.wrh-diff{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;margin:0;border-radius:11px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:13px;box-shadow:0 2px 5px rgba(60,45,20,.15)}
.wrh-ui button.wrh-diff.on{background:#fff;border-color:#d8362e;box-shadow:0 0 0 2px rgba(216,54,46,.2)}
.wrh-sk-row{display:inline-flex;gap:2px;align-items:center}
.wrh-skull{display:block}
.wrh-ro{display:flex;gap:10px;align-items:center;margin:6px 0 10px;font-size:13px}
.wrh-thumb-s{width:84px;aspect-ratio:3/2;border-radius:7px;object-fit:cover}
.wrh-ui button.wrh-play{width:100%;font-size:19px;padding:13px;margin:6px 0 4px;background:linear-gradient(180deg,#38b6ff,#1488e6);box-shadow:0 3px 0 #0e6fba}
.wrh-classes{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:4px 0 2px;width:100%;max-width:340px}
.wrh-ui button.wrh-class{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 2px;margin:0;border-radius:10px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:11px;box-shadow:0 2px 4px rgba(60,45,20,.15)}
.wrh-ui button.wrh-class .ci{font-size:20px;line-height:1.1}
.wrh-ui button.wrh-class.on{background:#fff;border-color:#1fa2ff}
.wrh-class-tip{font-size:12px;opacity:.8;min-height:30px;text-align:center;max-width:340px}
.wrh-combo{position:absolute;right:16px;top:90px;text-align:right;font-weight:900;color:#d8362e;text-shadow:0 2px 0 #fff,0 0 14px rgba(255,255,255,.8);pointer-events:none;transition:transform .08s}
.wrh-combo b{font-size:42px;display:block;line-height:1}
.wrh-combo small{font-size:13px;color:#3a352d;font-weight:700}
.wrh-ui.night .wrh-combo small{color:#e9effa}
.wrh-statrow{display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;margin:2px 0}
.wrh-statrow .wrh-dot{flex:none}
.wrh-invite{background:#e7f6e9;border:2px solid #7ccf8a;border-radius:9px;padding:6px 10px;margin:0 0 10px;font-size:13px}
.wrh-ui.night .wrh-top,.wrh-ui.night .wrh-me,.wrh-ui.night .wrh-hint,.wrh-ui.night .wrh-squad div{text-shadow:none}
.wrh-ui.night .wrh-bar{background:rgba(255,255,255,.18)}
.wrh-inv{position:absolute;right:14px;bottom:182px;width:236px;display:flex;flex-direction:column;gap:3px;z-index:5;pointer-events:none}
.wrh-inv .row{display:flex;align-items:center;gap:6px;height:26px;padding:0 8px 0 4px;border-radius:9px;border:2px solid transparent;background:rgba(251,246,234,.82);box-shadow:0 1px 4px rgba(20,28,44,.14);font-size:12px;font-weight:700;color:#2b3a52}
.wrh-inv kbd{min-width:19px;height:19px;line-height:19px;border-radius:5px;background:#2b3a52;color:#fff;text-align:center;font:800 11px/19px system-ui,sans-serif}
.wrh-inv img{width:46px;height:22px;object-fit:contain;flex:none}
.wrh-inv .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wrh-inv b{font-variant-numeric:tabular-nums;font-size:11px}
.wrh-inv .row.cur{border-color:#ffd21f;background:rgba(255,248,214,.97);box-shadow:0 0 0 1px rgba(255,210,31,.55),0 0 10px rgba(255,210,31,.5)}
.wrh-inv .row.dry{opacity:.4}
.wrh-plabel{position:absolute;left:0;top:0;pointer-events:none;display:none;white-space:nowrap;font:700 12px/1 system-ui,sans-serif;color:#fff;background:rgba(20,26,38,.62);padding:3px 7px;border-radius:9px;border:1.5px solid #fff;text-shadow:0 1px 1px rgba(0,0,0,.5)}
.wrh-ammo{position:absolute;transform:translate(-50%,-50%);pointer-events:none;display:none}
/* the ring itself is a 3D object on the floor (render/ammoRing.ts); this element only carries the count */
.wrh-ammo i{display:none;position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,var(--c) calc(var(--f)*1%),rgba(30,36,48,.28) 0);-webkit-mask:radial-gradient(closest-side,transparent 76%,#000 79%);mask:radial-gradient(closest-side,transparent 76%,#000 79%);filter:drop-shadow(0 0 3px rgba(0,0,0,.35))}
.wrh-ammo b{position:absolute;left:100%;top:50%;transform:translate(8px,-50%);font-size:14px;font-weight:800;color:#fff;white-space:nowrap;padding:0 7px;border-radius:9px;background:rgba(25,30,42,.62);text-shadow:0 1px 0 rgba(0,0,0,.6)}
.wrh-ammo.low b{background:rgba(190,30,30,.8);animation:wrhblink .4s infinite alternate}
.wrh-ammo.reload i{animation:wrhspin 0.9s linear infinite}
@keyframes wrhspin{from{filter:drop-shadow(0 0 3px rgba(0,0,0,.35)) brightness(1)}to{filter:drop-shadow(0 0 5px rgba(255,255,255,.7)) brightness(1.4)}}
.wrh-arrow-off{position:absolute;pointer-events:none;display:none;transform:translate(-50%,-50%)}
.wrh-arrow-off i{display:block;width:0;height:0;border-left:18px solid var(--c);border-top:10px solid transparent;border-bottom:10px solid transparent;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
.wrh-arrow-off span{position:absolute;left:50%;top:18px;transform:translateX(-50%);font-size:10px;font-weight:700;padding:0 5px;border-radius:7px;background:rgba(250,244,232,.85);white-space:nowrap}
.wrh-arrow-off.down i{animation:wrhblink .6s infinite alternate}
@keyframes wrhblink{from{opacity:1}to{opacity:.35}}
.wrh-ring{position:absolute;width:64px;height:64px;transform:translate(-50%,-50%);pointer-events:none;display:none}
.wrh-ring i{position:absolute;inset:0;border-radius:50%}
.wrh-ring .bleed{background:conic-gradient(#e0524a calc(var(--b)*1%),rgba(60,45,20,.25) 0);-webkit-mask:radial-gradient(circle,transparent 58%,#000 60%);mask:radial-gradient(circle,transparent 58%,#000 60%)}
.wrh-ring .prog{inset:7px;background:conic-gradient(#3dd66a calc(var(--p)*1%),rgba(60,45,20,.22) 0);-webkit-mask:radial-gradient(circle,transparent 52%,#000 54%);mask:radial-gradient(circle,transparent 52%,#000 54%)}
.wrh-ring b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:15px;text-shadow:0 1px 0 #fff}
.wrh-ring.live .prog{filter:drop-shadow(0 0 4px rgba(61,214,106,.9))}
.wrh-tag{position:absolute;transform:translate(-50%,-100%);font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(250,244,232,.85);border:2px solid;white-space:nowrap;pointer-events:none}
.wrh-reload{position:absolute;right:14px;bottom:36px;width:180px;height:6px;border-radius:4px;background:rgba(60,45,20,.25);overflow:hidden;display:none}
.wrh-reload>i{display:block;height:100%;background:#ff9a3a;width:0}
/* polish: soft cards, smooth anti-aliased bars, steady text rendering */
.wrh-ui{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrh-top{padding:6px 18px 9px;border-radius:14px;background:rgba(251,246,234,.74);box-shadow:0 2px 10px rgba(20,28,44,.16);backdrop-filter:blur(2px);border:1.5px solid rgba(43,58,82,.14)}
.wrh-top .big{font-size:21px;letter-spacing:.01em;text-shadow:none;color:#2b3a52}
.wrh-top small{text-shadow:none}
.wrh-bar{position:relative;height:11px;border-radius:6px;background:rgba(30,40,58,.28);box-shadow:inset 0 1px 2px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.35)}
.wrh-bar>i{border-radius:inherit;background:linear-gradient(180deg,#5cc4ff,#1587e6);box-shadow:inset 0 2px 2px rgba(255,255,255,.45),inset 0 -2px 3px rgba(0,40,100,.25);transition:width .25s ease-out}
.wrh-bar.boss>i{background:linear-gradient(180deg,#f2665b,#c0281f)}
.wrh-me{padding:7px 12px;border-radius:12px;background:rgba(251,246,234,.78);box-shadow:0 2px 8px rgba(20,28,44,.16);border:1.5px solid rgba(43,58,82,.14);text-shadow:none;color:#2b3a52}
.wrh-me small{text-shadow:none}
.wrh-hint{padding:3px 12px;border-radius:10px;background:rgba(251,246,234,.6);opacity:.85;text-shadow:none;color:#2b3a52}
.wrh-gear{box-shadow:0 2px 8px rgba(20,28,44,.2);transition:transform .12s,background .12s}
.wrh-gear:hover{transform:scale(1.08);background:#fff}
.wrh-warn{border-radius:10px;padding:5px 14px;box-shadow:0 3px 12px rgba(120,20,16,.35);animation:wrh-lowhp .6s ease-in-out infinite alternate}
.wrh-mini{border-radius:12px;box-shadow:0 3px 12px rgba(20,28,44,.22)}
.wrh-reload{height:8px;border-radius:5px;background:rgba(30,40,58,.3);box-shadow:inset 0 1px 2px rgba(0,0,0,.3)}
.wrh-reload>i{border-radius:inherit;background:linear-gradient(180deg,#ffb561,#ff8a1f);box-shadow:inset 0 1px 1px rgba(255,255,255,.5)}
.wrh-ui.night .wrh-top,.wrh-ui.night .wrh-me,.wrh-ui.night .wrh-hint{color:#2b3a52;text-shadow:none}

.wrh-scroll{max-height:92vh;overflow:auto}
.wrh-ui button.wrh-wp:disabled{opacity:.45;cursor:not-allowed}
.wrh-keys{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:4px 0 8px;font-size:12px}
.wrh-keys button{margin:0;padding:3px 8px;font-size:12px;background:#e6dcc8;color:#3a352d}
.wrh-low{color:#d8362e}
.wrh-hud-dev{position:absolute;left:12px;top:26px;font-size:12px;line-height:1.5}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** DOM overlay: menu, lobby, HUD, cards, down/dead/game-over screens, settings. */
const thumbCache = new Map<number, string>();

/** One emoji per class for the picker. */
const CLASS_ICONS = ['\u{1F396}\uFE0F', '\u{1FA7A}', '\u{1F6E1}\uFE0F', '\u{1F45F}', '\u{1F4A3}', '\u{1F3AF}', '\u{1F608}'];

/** A little top-down picture of an arena layout, painted from the same data the game uses (cached as a data URL). */
function arenaThumb(index: number): string {
  const hit = thumbCache.get(index);
  if (hit) return hit;
  const W = 240, H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return '';
  const s = W / (ARENA_HALF_W * 2);
  const X = (x: number): number => W / 2 + x * s;
  const Y = (y: number): number => H / 2 - y * s;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#e6ebf0');
  grad.addColorStop(1, '#d3dae2');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,135,150,.25)';
  g.lineWidth = 1;
  for (let x = -ARENA_HALF_W; x <= ARENA_HALF_W; x += 5) {
    g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke();
  }
  for (let y = -ARENA_HALF_H; y <= ARENA_HALF_H; y += 5) {
    g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke();
  }
  const theme = THEMES[index] ?? THEMES[0]!;
  for (const b of MAPS[index]?.boxes ?? []) {
    const x = X(b.x - b.w / 2), y = Y(b.y + b.h / 2), w = b.w * s, h = b.h * s;
    g.fillStyle = 'rgba(40,50,65,.28)';
    g.fillRect(x + 2.5, y + 3, w, h); // shadow
    g.fillStyle = theme.side;
    g.fillRect(x, y + 2, w, h); // front face
    g.fillStyle = theme.top;
    g.fillRect(x, y, w, h);
    g.strokeStyle = theme.rim;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  // the barrier fence around the floor
  g.strokeStyle = '#7d8896';
  g.lineWidth = 5;
  g.setLineDash([9, 4]);
  g.strokeRect(2.5, 2.5, W - 5, H - 5);
  g.setLineDash([]);
  const url = c.toDataURL('image/png');
  thumbCache.set(index, url);
  return url;
}

/** A skull icon: bone white when lit, faint when not. */
function skull(lit: boolean, size = 22): string {
  const body = lit ? '#fbf6ea' : '#cfc6b3';
  const line = lit ? '#3a352d' : '#a89f8c';
  const eye = lit ? '#2b2118' : '#a89f8c';
  return `<svg class="wrh-skull" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2.2C6.9 2.2 3.2 5.7 3.2 10.4c0 2.7 1.3 4.8 3.3 6.1V20c0 .6.4 1 1 1H9v-2h1.2v2h3.6v-2H15v2h1.5c.6 0 1-.4 1-1v-3.5c2-1.3 3.3-3.4 3.3-6.1 0-4.7-3.7-8.2-8.8-8.2z" fill="${body}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="8.6" cy="11" rx="2.4" ry="2.7" fill="${eye}"/><ellipse cx="15.4" cy="11" rx="2.4" ry="2.7" fill="${eye}"/><path d="M12 13.3l-1.1 2.2h2.2z" fill="${eye}"/></svg>`;
}

export class Ui {
  readonly root = document.createElement('div');
  lang: Lang = 'en';
  /** Starting weapon chosen in the menu or lobby. */
  weapon: WeaponId = 'pistol';
  /** Arena (-1 random) and difficulty picked for solo games. */
  map = -1;
  difficulty = 1;
  /** Accessory index. */
  acc = 0;
  /** Vest colour index (-1: the slot's own colour). */
  color = -1;
  /** Class index (see CLASS_IDS). */
  cls = 0;
  /** Names of the players by slot (game over screen). */
  playerNames: string[] = [];
  /** Colour of a player slot as the game draws it (set by main from the lobby choices). */
  slotColor: (slot: number) => string = (s) => PLAYER_COLORS[s % PLAYER_COLORS.length]!;
  private preview: Preview | null = null;
  private previewMode: 'char' | 'weapon' = 'char';
  private readonly screen = document.createElement('div');
  private readonly hud = document.createElement('div');
  private readonly dev = document.createElement('div');
  private hudBuilt = false;
  private lastCards = '';
  private settingsOpen = false;
  private readonly settingsEl = document.createElement('div');
  private lastHud = 0;
  private bannerUntil = 0;

  constructor(
    parent: HTMLElement,
    private readonly h: UiHandlers,
    private settings: Settings,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = 'wrh-ui';
    this.lang = settings.lang;
    this.hud.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.dev.className = 'wrh-hud-dev';
    this.root.append(this.hud, this.dev, this.screen, this.settingsEl);
    // every button gets a click sound; the important ones a confirmation
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button, .wrh-card, .wrh-gear');
      if (!b) return;
      if (b.classList.contains('wrh-gear')) this.h.onUiSound('open');
      else if (['wrh-solo', 'wrh-host', 'wrh-join', 'wrh-start', 'wrh-again'].includes(b.id) || b.classList.contains('wrh-card')) this.h.onUiSound('confirm');
      else if (['wrh-leave', 's-close'].includes(b.id)) this.h.onUiSound('back');
      else this.h.onUiSound('click');
    });
    parent.appendChild(this.root);
  }

  /** Translate a UI string key (for messages the game shows outside the UI module). */
  tr(key: 'noServer' | 'noConnect' | 'connLost' | 'desync' | 'reconnecting' | 'syncing' | 'joining'): string {
    return (this.t as unknown as Record<string, string>)[key]!;
  }

  private get t(): (typeof UI_STRINGS)['en'] {
    return UI_STRINGS[this.lang] as (typeof UI_STRINGS)['en'];
  }

  setDev(html: string): void {
    this.dev.innerHTML = html;
  }

  clearScreen(): void {
    this.disposePreview();
    this.screen.innerHTML = '';
  }

  /** The name typed in the menu (or the remembered one). */
  name(): string {
    const el = this.screen.querySelector<HTMLInputElement>('#wrh-name');
    try {
      return el?.value.trim() || localStorage.getItem('wrh.name') || 'player';
    } catch {
      return el?.value.trim() || 'player';
    }
  }

  /** A row of toggle buttons; `value` is highlighted and `pick` runs when one is chosen. */
  private group(items: { id: string; label: string; disabled?: boolean; tip?: string }[], value: string, attr: string): string {
    return items
      .map((i) => `<button type="button" class="wrh-wp${i.id === value ? ' on' : ''}" data-${attr}="${i.id}"${i.disabled ? ' disabled' : ''}${i.tip ? ` title="${esc(i.tip)}"` : ''}>${i.label}</button>`)
      .join('');
  }

  private bindGroup(attr: string, pick: (id: string) => void): void {
    this.screen.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.onclick = () => {
        pick(el.getAttribute(`data-${attr}`)!);
        this.screen.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === el));
      };
    });
  }

  /** Look up the public relay and fill the server field with it unless the player typed their own address. */
  private async fillRelay(explicit: boolean): Promise<void> {
    const input = this.screen.querySelector<HTMLInputElement>('#wrh-server');
    const note = this.screen.querySelector<HTMLElement>('#wrh-relay-note');
    if (!input || !note) return;
    const own = input.value.trim();
    // a remembered address that is not a quick tunnel (those die) or one from the link is the player's choice
    if (explicit || (own && !/trycloudflare\.com/.test(own))) return;
    note.textContent = this.t.relayLooking;
    const relay = await discoverRelay();
    if (!note.isConnected) return;
    if (relay) {
      if (!input.value.trim() || /trycloudflare\.com/.test(input.value)) input.value = relay.url;
      note.textContent = `${this.t.relayOnline} (v${relay.version})`;
      note.style.color = '#2a8a3a';
    } else {
      note.textContent = this.t.relayOffline;
      note.style.color = '#c8242c';
    }
  }

  /** Icon, bar and number for each trait of a weapon; bars are scaled against the best of all weapons. */
  private weaponStatBars(id: WeaponId): string {
    const t = this.t;
    const all = WEAPON_IDS.map((w) => BALANCE.weapons[w]);
    const perShot = (s: (typeof all)[number]): number => s.damage * s.pellets + (s.blastDamage ?? 0);
    const max = (f: (s: (typeof all)[number]) => number): number => Math.max(...all.map(f));
    const s = BALANCE.weapons[id];
    const dps = perShot(s) * s.rate;
    const rows: { icon: string; label: string; frac: number; text: string }[] = [
      { icon: '&#128165;', label: t.statDmg, frac: perShot(s) / max(perShot), text: `${s.damage}${s.pellets > 1 ? '&times;' + s.pellets : ''}${s.blast ? ' + ' + s.blastDamage : ''}` },
      { icon: '&#9889;', label: t.statRate, frac: s.rate / max((x) => x.rate), text: `${s.rate}/s` },
      { icon: '&#128293;', label: t.statDps, frac: dps / max((x) => perShot(x) * x.rate), text: String(Math.round(dps)) },
      { icon: '&#127919;', label: t.statRange, frac: s.range / max((x) => x.range), text: String(s.range) },
      { icon: '&#9678;', label: t.statAcc, frac: 1 - s.spread / (max((x) => x.spread) * 1.1), text: `${Math.round((1 - s.spread) * 100)}%` },
      { icon: '&#128230;', label: t.statMag, frac: s.mag / max((x) => x.mag), text: String(s.mag) },
      { icon: '&#128260;', label: t.statReload, frac: 1 - s.reload / (max((x) => x.reload) * 1.2), text: `${s.reload}s` },
      { icon: '&#10138;', label: s.blast ? t.statBlast : t.statPierce, frac: s.blast ? s.blast / 3 : Math.min(1, s.pierce / 5), text: s.blast ? String(s.blast) : String(s.pierce) },
      { icon: '&#127873;', label: t.statAmmo, frac: s.ammo < 0 ? 1 : s.ammo / max((x) => (x.ammo < 0 ? 0 : x.ammo)), text: s.ammo < 0 ? '&infin;' : String(s.ammo) },
    ];
    return rows
      .map((r) => `<div class="wrh-stat"><span class="ic">${r.icon}</span><span class="nm">${r.label}</span><span class="bar"><i style="width:${Math.max(4, Math.min(100, Math.round(r.frac * 100)))}%"></i></span><b>${r.text}</b></div>`)
      .join('');
  }

  /** Link that opens this page with the room code and server already filled in (no password in the link). */
  private inviteLink(code: string): string {
    let server = '';
    try {
      server = localStorage.getItem('wrh.server') ?? '';
    } catch {
      /* ignore */
    }
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('join', code);
    // quick tunnels die; the page finds the current public relay by itself when the link has no server
    if (server && !/trycloudflare\.com/.test(server)) u.searchParams.set('server', server);
    return u.toString();
  }

  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  /** Markup of the 3D preview: tabs, the turntable, arrows for the accessory or weapon, and the colour swatches. */
  private previewBlock(): string {
    const t = this.t;
    const swatches = PLAYER_COLORS.map((c, i) => `<button type="button" class="wrh-sw${i === this.color ? ' on' : ''}" data-sw="${i}" style="background:${c}" aria-label="${c}"></button>`).join('');
    return `<div class="wrh-prev">
      <div class="wrh-tabs"><button type="button" class="wrh-wp${this.previewMode === 'char' ? ' on' : ''}" data-ptab="char">${t.tabChar}</button><button type="button" class="wrh-wp${this.previewMode === 'weapon' ? ' on' : ''}" data-ptab="weapon">${t.tabWeapon}</button></div>
      <div class="wrh-stage"><button type="button" class="wrh-arrow" data-pdir="-1" aria-label="previous">&#9664;</button><div class="wrh-canvas" id="wrh-prev-host"></div><button type="button" class="wrh-arrow" data-pdir="1" aria-label="next">&#9654;</button></div>
      <div class="wrh-prev-name" id="wrh-prev-name"></div><div class="wrh-prev-stats" id="wrh-prev-stats"></div>
      <div class="wrh-swatches" id="wrh-swatches">${swatches}</div>
      <label style="margin-top:8px">${t.classTitle}</label>
      <div class="wrh-classes">${(t.classNames as readonly string[]).map((n, i) => `<button type="button" class="wrh-class${i === this.cls ? ' on' : ''}" data-cls="${i}" title="${esc((t.classTips as readonly string[])[i]!)}"><span class="ci">${CLASS_ICONS[i]}</span><b>${n}</b></button>`).join('')}</div>
      <div class="wrh-class-tip" id="wrh-class-tip">${esc((t.classTips as readonly string[])[this.cls]!)}</div>
    </div>`;
  }

  /** Wire the preview block: arrows change the accessory (Character tab) or the weapon (Weapon tab), swatches the colour. */
  private bindPreview(): void {
    this.disposePreview();
    const host = this.screen.querySelector<HTMLElement>('#wrh-prev-host');
    if (!host) return;
    try {
      this.preview = new Preview(230);
      host.appendChild(this.preview.canvas);
    } catch {
      this.preview = null; // no WebGL for a second context: the menu still works without the picture
    }
    const names = this.t.accs as readonly string[];
    const weaponNames = this.t.weapons as Record<string, string>;
    const unlocked = (): WeaponId[] => WEAPON_IDS.filter((w) => isUnlocked(w, loadProfile()));
    const refresh = (): void => {
      const colorHex = PLAYER_COLORS[this.color >= 0 ? this.color % PLAYER_COLORS.length : 0]!;
      const q = (id: string): HTMLElement => this.screen.querySelector<HTMLElement>('#' + id)!;
      q('wrh-prev-name').textContent = this.previewMode === 'char' ? (names[this.acc] ?? '') : (weaponNames[this.weapon] ?? '');
      q('wrh-prev-stats').innerHTML = this.previewMode === 'weapon' ? this.weaponStatBars(this.weapon) : '';
      this.screen.querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) => el.classList.toggle('on', el.dataset.ptab === this.previewMode));
      this.screen.querySelectorAll<HTMLElement>('[data-sw]').forEach((el) => el.classList.toggle('on', Number(el.dataset.sw) === this.color));
      this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => el.classList.toggle('on', el.dataset.w === this.weapon));
      void this.preview?.set({ mode: this.previewMode, accessory: ACCESSORIES[this.acc % ACCESSORIES.length]!, color: colorHex, weapon: this.weapon });
    };
    this.screen.querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) => {
      el.onclick = () => {
        this.previewMode = el.dataset.ptab as 'char' | 'weapon';
        refresh();
      };
    });
    this.screen.querySelectorAll<HTMLElement>('[data-pdir]').forEach((el) => {
      el.onclick = () => {
        const dir = Number(el.dataset.pdir);
        if (this.previewMode === 'char') {
          this.acc = (this.acc + dir + ACCESSORIES.length) % ACCESSORIES.length;
          this.persistLook();
          this.h.onLook(this.acc, this.color, this.cls);
        } else {
          const list = unlocked();
          const at = Math.max(0, list.indexOf(this.weapon));
          this.weapon = list[(at + dir + list.length) % list.length]!;
          this.h.onWeapon(this.weapon);
        }
        refresh();
      };
    });
    this.screen.querySelectorAll<HTMLElement>('[data-cls]').forEach((el) => {
      el.onclick = () => {
        this.cls = Number(el.dataset.cls);
        this.persistLook();
        this.h.onLook(this.acc, this.color, this.cls);
        this.screen.querySelectorAll<HTMLElement>('[data-cls]').forEach((x) => x.classList.toggle('on', x === el));
        const tip = this.screen.querySelector<HTMLElement>('#wrh-class-tip');
        if (tip) tip.textContent = (this.t.classTips as readonly string[])[this.cls] ?? '';
      };
    });
    this.screen.querySelectorAll<HTMLElement>('[data-sw]').forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset.sw);
        this.color = this.color === i ? -1 : i;
        this.persistLook();
        this.h.onLook(this.acc, this.color, this.cls);
        refresh();
      };
    });
    // picking a weapon in the list also shows it
    this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => {
      el.addEventListener('click', () => {
        this.previewMode = 'weapon';
        refresh();
      });
    });
    refresh();
  }

  private persistLook(): void {
    const p = loadProfile();
    p.acc = this.acc;
    p.color = this.color;
    p.cls = this.cls;
    p.map = this.map;
    p.difficulty = this.difficulty;
    saveProfile(p);
  }

  /** Option rows shared by the menu and the lobby: arena and difficulty (host or solo) and the player's look. */
  private optionRows(editable: boolean, map: number, difficulty: number): string {
    return this.previewBlock() + this.arenaRows(editable, map, difficulty);
  }

  /** Arena pictures and the skull difficulty row (read-only text for guests in a lobby). */
  private arenaRows(editable: boolean, map: number, difficulty: number): string {
    const t = this.t;
    const names = t.maps as Record<string, string>;
    const diffNames = t.diffs as readonly string[];
    const skulls = (n: number): string => [0, 1, 2].map((k) => skull(k <= n)).join('');
    if (!editable) {
      const pic = map >= 0 ? `<img class="wrh-thumb-s" src="${arenaThumb(map)}" alt="">` : '<span class="wrh-thumb-s wrh-dice">?</span>';
      return `<div class="wrh-ro">${pic}<span><b>${names[String(map)]}</b><br><span class="wrh-sk-row">${skulls(difficulty)}</span> <b>${diffNames[difficulty]}</b></span></div>`;
    }
    const cards = ['-1', ...MAPS.map((_, i) => String(i))]
      .map((id) => {
        const pic = id === '-1' ? '<span class="wrh-dice">?</span>' : `<img src="${arenaThumb(Number(id))}" alt="">`;
        return `<button type="button" class="wrh-arena${id === String(map) ? ' on' : ''}" data-map="${id}">${pic}<span>${names[id]}</span></button>`;
      })
      .join('');
    const diffs = diffNames
      .map((label, i) => `<button type="button" class="wrh-diff${i === difficulty ? ' on' : ''}" data-diff="${i}"><span class="wrh-sk-row">${skulls(i)}</span><span>${label}</span></button>`)
      .join('');
    return `<label>${t.arena}</label><div class="wrh-arenas">${cards}</div><label>${t.difficulty}</label><div class="wrh-diffs">${diffs}</div>`;
  }

  showMenu(error = ''): void {
    const t = this.t;
    const profile = loadProfile();
    this.acc = profile.acc;
    this.color = profile.color;
    this.cls = profile.cls;
    this.map = profile.map;
    this.difficulty = profile.difficulty;
    const saved = (() => {
      try {
        return localStorage.getItem('wrh.name') ?? '';
      } catch {
        return '';
      }
    })();
    const stored = (() => {
      try {
        return localStorage.getItem('wrh.server') ?? '';
      } catch {
        return '';
      }
    })();
    const params = new URLSearchParams(location.search);
    const fromParam = params.get('server');
    const inviteCode = (params.get('join') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const hosted = location.hostname.endsWith('github.io');
    const defServer = fromParam ?? (stored || (hosted ? '' : location.port === '5173' ? `ws://${location.hostname}:8787/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`));
    const rejoin = loadRejoin();
    this.screen.innerHTML = `<div class="wrh-panel wrh-center wrh-scroll wrh-menu">
      <h1 class="wrh-logo">${t.title}</h1><p class="sub">${t.tag} &middot; ${t.best}: ${profile.bestWave} / ${profile.bestKills}</p>
      ${inviteCode ? `<p class="wrh-invite">&#127881; ${t.invited} <b>${esc(inviteCode)}</b>. ${t.invitedHint}</p>` : ''}
      <div class="wrh-cols"><div>
      <label>${t.name}</label><input id="wrh-name" maxlength="16" value="${esc(saved)}" placeholder="player">
      <label>${t.weapon}</label><div class="wrh-weapons" id="wrh-weapons">${this.weaponButtons()}</div>
      ${this.previewBlock()}
      </div><div>
      ${this.arenaRows(true, this.map, this.difficulty)}
      <button id="wrh-solo" class="wrh-play">${t.solo}</button>
      <button id="wrh-host" class="alt">${t.host}</button>
      ${rejoin ? `<button id="wrh-rejoin" class="alt">${t.rejoin} (${esc(rejoin.code)})</button>` : ''}
      <div class="wrh-row"><div style="flex:1"><label>${t.code}</label><input id="wrh-code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD" value="${esc(inviteCode)}"></div><button id="wrh-join" class="alt">${t.join}</button></div>
      <label>${t.password}</label><input id="wrh-pass" maxlength="24" autocomplete="off">
      <label>${t.server}</label><input id="wrh-server" value="${esc(defServer)}" placeholder="wss://your-tunnel.example.com/ws"><p class="sub" id="wrh-relay-note" style="margin:-6px 0 8px"></p>
      </div></div>
      <p class="sub" style="margin:10px 0 0;text-align:center">${t.controls}</p>
      ${error ? `<p style="color:#c8242c;font-weight:700">${esc(error)}</p>` : ''}
    </div>`;
    this.bindWeapons();
    this.bindPreview();
    void this.fillRelay(fromParam !== null);
    this.bindGroup('map', (id) => {
      this.map = Number(id);
      this.persistLook();
    });
    this.bindGroup('diff', (id) => {
      this.difficulty = Number(id);
      this.persistLook();
    });
    const q = <E extends HTMLElement>(id: string): E => this.screen.querySelector<E>('#' + id)!;
    const name = (): string => {
      const n = q<HTMLInputElement>('wrh-name').value.trim() || 'player';
      try {
        localStorage.setItem('wrh.name', n);
      } catch {
        /* ignore */
      }
      return n;
    };
    const pass = (): string => q<HTMLInputElement>('wrh-pass').value;
    q('wrh-solo').onclick = () => this.h.onSolo(name());
    q('wrh-host').onclick = () => this.h.onHost(name(), q<HTMLInputElement>('wrh-server').value.trim(), pass());
    q('wrh-join').onclick = () => this.h.onJoin(name(), q<HTMLInputElement>('wrh-code').value.trim().toUpperCase(), q<HTMLInputElement>('wrh-server').value.trim(), pass());
    if (inviteCode) {
      q('wrh-join').classList.remove('alt');
      q('wrh-host').classList.add('alt');
      q('wrh-name').focus();
      // Enter in the name box joins the invited room
      q('wrh-name').onkeydown = (e) => {
        if ((e as KeyboardEvent).key === 'Enter') q('wrh-join').click();
      };
    }
    const rj = this.screen.querySelector<HTMLElement>('#wrh-rejoin');
    if (rj) rj.onclick = () => this.h.onRejoin();
  }

  /** Pause screen (solo only; online games keep running). */
  showPause(): void {
    const t = this.t;
    this.screen.innerHTML = `<div class="wrh-panel wrh-center" style="text-align:center"><h1>${t.paused}</h1>
      <button id="wrh-resume">${t.resume}</button><button id="wrh-pset" class="alt">${t.settings}</button><button id="wrh-leave" class="warn">${t.leave}</button></div>`;
    this.screen.querySelector<HTMLElement>('#wrh-resume')!.onclick = () => this.h.onResume();
    this.screen.querySelector<HTMLElement>('#wrh-pset')!.onclick = () => this.toggleSettings();
    this.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.h.onLeave();
  }

  private readonly tagEls: (HTMLDivElement | null)[] = new Array<HTMLDivElement | null>(MAX_PLAYERS).fill(null);

  /** Name label floating over a teammate (screen position in px); `visible` false hides it. */
  private arrowEls: HTMLElement[] = [];

  /** Arrow on the screen edge pointing at an off-screen teammate (angle in screen space, blinks while they are down). */
  setArrow(slot: number, name: string, color: string, px: number, py: number, angle: number, visible: boolean, down = false): void {
    let el = this.arrowEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-arrow-off';
      el.innerHTML = '<i></i><span></span>';
      this.root.appendChild(el);
      this.arrowEls[slot] = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.setProperty('--c', color);
    el.classList.toggle('down', down);
    (el.firstElementChild as HTMLElement).style.transform = `rotate(${angle}rad)`;
    const label = el.lastElementChild as HTMLElement;
    if (label.textContent !== name) label.textContent = name;
  }

  private comboEl: HTMLElement | null = null;

  /** The kill counter on the right while a streak is going (count 0 hides it). */
  setCombo(count: number, label: string): void {
    let el = this.comboEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-combo';
      el.innerHTML = '<b></b><small></small>';
      this.root.appendChild(el);
      this.comboEl = el;
    }
    el.style.display = count >= 3 ? 'block' : 'none';
    if (count < 3) return;
    const b = el.firstElementChild as HTMLElement;
    if (b.textContent !== `x${count}`) {
      b.textContent = `x${count}`;
      el.style.transform = 'scale(1.18)';
      setTimeout(() => (el!.style.transform = 'scale(1)'), 80);
    }
    (el.lastElementChild as HTMLElement).textContent = label;
  }

  private ammoEl: HTMLElement | null = null;
  private pickupLabels: HTMLElement[] = [];

  /** Name tags over the loot lying on the floor (screen positions in pixels). */
  setPickupLabels(items: { px: number; py: number; text: string; color: string }[]): void {
    while (this.pickupLabels.length < items.length) {
      const el = document.createElement('div');
      el.className = 'wrh-plabel';
      this.root.appendChild(el);
      this.pickupLabels.push(el);
    }
    for (let i = 0; i < this.pickupLabels.length; i++) {
      const el = this.pickupLabels[i]!;
      const it = items[i];
      if (!it) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      if (el.textContent !== it.text) el.textContent = it.text;
      el.style.borderColor = it.color;
      el.style.color = it.color;
      el.style.transform = `translate(${Math.round(it.px)}px,${Math.round(it.py)}px) translate(-50%,-100%)`;
    }
  }

  get powerupNames(): string[] {
    return this.t.powerups as unknown as string[];
  }

  weaponName(id: string): string {
    return (this.t.weapons as Record<string, string>)[id] ?? id;
  }


  /** The ring around the player's feet: green when the magazine is full, red when it runs out, with the rounds left beside it. */
  /** Light text on the HUD while it is night. */
  setNightHud(on: boolean): void {
    this.root.classList.toggle('night', on);
  }

  setAmmoRing(px: number, py: number, w: number, frac: number, text: string, visible: boolean, reloading: boolean): void {
    let el = this.ammoEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-ammo';
      el.innerHTML = '<i></i><b></b>';
      this.root.appendChild(el);
      this.ammoEl = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.width = `${w}px`;
    el.style.height = `${w * 0.52}px`;
    const f = Math.max(0, Math.min(1, frac));
    el.style.setProperty('--f', String(Math.round(f * 100)));
    el.style.setProperty('--c', `hsl(${Math.round(f * 125)} 85% 48%)`);
    el.classList.toggle('reload', reloading);
    el.classList.toggle('low', f <= 0.25 && !reloading);
    const b = el.lastElementChild as HTMLElement;
    if (b.textContent !== text) b.textContent = text;
  }

  private ringEls: HTMLElement[] = [];

  /** Round progress ring over a downed player: red = time left before they bleed out, green = the revive in progress. */
  setRing(slot: number, bleed: number, progress: number, px: number, py: number, visible: boolean, active: boolean): void {
    let el = this.ringEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-ring';
      el.innerHTML = '<i class="bleed"></i><i class="prog"></i><b>&#10010;</b>';
      this.root.appendChild(el);
      this.ringEls[slot] = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.setProperty('--b', String(Math.round(bleed * 100)));
    el.style.setProperty('--p', String(Math.round(progress * 100)));
    el.classList.toggle('live', active);
  }

  setTag(slot: number, text: string, color: string, px: number, py: number, visible: boolean): void {
    let el = this.tagEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-tag';
      this.root.appendChild(el);
      this.tagEls[slot] = el;
    }
    if (el.textContent !== text) el.textContent = text;
    el.style.borderColor = color;
    el.style.display = visible ? 'block' : 'none';
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
  }

  private floaters = 0;

  /** A damage number that rises from a screen position and fades out. */
  popNumber(px: number, py: number, text: string, big: boolean): void {
    if (this.floaters >= 18) return;
    this.floaters++;
    const el = document.createElement('div');
    el.className = 'wrh-dmg';
    el.textContent = text;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.fontSize = big ? '22px' : '15px';
    el.style.color = big ? '#ffd23a' : '#fff';
    this.root.appendChild(el);
    const dx = (Math.random() - 0.5) * 30;
    const a = el.animate([{ transform: 'translate(-50%,0) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),-46px) scale(${big ? 1.25 : 0.9})`, opacity: 0 }], { duration: 650, easing: 'ease-out' });
    a.onfinish = () => {
      el.remove();
      this.floaters--;
    };
  }

  private weaponButtons(): string {
    const names = this.t.weapons as Record<string, string>;
    const profile = loadProfile();
    return WEAPON_IDS.map((w) => {
      const ok = isUnlocked(w, profile);
      return `<button type="button" class="wrh-wp${w === this.weapon ? ' on' : ''}" data-w="${w}"${ok ? '' : ` disabled title="${esc(`${this.t.lockedTip} ${WEAPON_UNLOCK[w]}`)}"`}>${ok ? '' : '&#128274; '}${names[w]}</button>`;
    }).join('');
  }

  private bindWeapons(): void {
    this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => {
      el.onclick = () => {
        this.weapon = el.dataset.w as WeaponId;
        this.screen.querySelectorAll('.wrh-wp[data-w]').forEach((x) => x.classList.toggle('on', x === el));
        this.h.onWeapon(this.weapon);
      };
    });
  }

  /** The weapon list above the minimap: key, icon, name and ammo of every owned weapon, the one in the hands outlined in yellow, the empty ones faded. */
  private inventoryHtml(world: World, slot: number): string {
    const names = this.t.weapons as Record<string, string>;
    const cur = world.pWeapon[slot]!;
    let rows = '';
    WEAPON_RANK.forEach((id, rank) => {
      const idx = WEAPON_IDS.indexOf(id);
      if (((world.pOwned[slot]! >> idx) & 1) === 0) return;
      const st = BALANCE.weapons[id];
      const live = idx === cur;
      const mag = live ? world.pMag[slot]! : world.pInvMag[slot * WEAPON_IDS.length + idx]!;
      const reserve = live ? world.pAmmo[slot]! : world.pInvAmmo[slot * WEAPON_IDS.length + idx]!;
      const dry = st.ammo >= 0 && mag <= 0 && reserve <= 0;
      const key = rank < 9 ? String(rank + 1) : 'Q';
      rows += `<div class="row${live ? ' cur' : ''}${dry ? ' dry' : ''}"><kbd>${key}</kbd><img src="${asset(`ui/wpn_${id}.png`)}" alt=""><span class="nm">${names[id] ?? id}</span><b>${mag}/${st.ammo < 0 ? '&infin;' : reserve}</b></div>`;
    });
    return rows;
  }

  private countEl: HTMLElement | null = null;
  /** Seconds currently shown by the floor countdown (for the pop animation and the tick sound). */
  countShown = -1;

  /** Big countdown at the top of the screen between floors: title, small line and the seconds; a null title hides it. */
  setFloorCountdown(title: string | null, small: string, secs: number): void {
    let el = this.countEl;
    if (title === null) {
      if (el && el.style.display !== 'none') el.style.display = 'none';
      this.countShown = -1;
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-count';
      el.innerHTML = '<b></b><i></i><small></small>';
      this.root.appendChild(el);
      this.countEl = el;
    }
    el.style.display = 'flex';
    const [b, num, sm] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement, el.children[2] as HTMLElement];
    if (b.textContent !== title) b.textContent = title;
    if (sm.textContent !== small) sm.textContent = small;
    if (secs !== this.countShown) {
      this.countShown = secs;
      num.textContent = String(secs);
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
    }
  }

  private loadingEl: HTMLElement | null = null;

  /** Full-screen "loading" overlay with a spinner (and a progress bar when `frac` is given); null hides it. */
  setLoading(text: string | null, frac?: number): void {
    let el = this.loadingEl;
    if (text === null) {
      if (el && el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-loading';
      el.innerHTML = '<div class="box"><i></i><b></b><u><s></s></u></div>';
      this.root.appendChild(el);
      this.loadingEl = el;
    }
    el.style.display = 'flex';
    const label = el.querySelector('b')!;
    if (label.textContent !== text) label.textContent = text;
    const bar = el.querySelector('u') as HTMLElement;
    bar.style.display = frac === undefined ? 'none' : 'block';
    if (frac !== undefined) (bar.firstElementChild as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  }

  showConnecting(): void {
    this.screen.innerHTML = `<div class="wrh-panel wrh-center"><h1>${this.t.connecting}</h1></div>`;
  }

  showLobby(
    code: string,
    players: { slot: number; name: string; host: boolean; connected: boolean; weapon: WeaponId; acc: number; color: number }[],
    iAmHost: boolean,
    options: { map: number; difficulty: number } = { map: 0, difficulty: 1 },
    locked = false,
  ): void {
    const t = this.t;
    const accNames = t.accs as readonly string[];
    const list = players
      .map(
        (p) =>
          `<li><span class="wrh-dot" style="background:${p.color >= 0 ? PLAYER_COLORS[p.color % PLAYER_COLORS.length] : PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"></span>${esc(p.name)} ${p.host ? `<small>(${t.host_tag})</small>` : ''} <small style="opacity:.7">&middot; ${(t.weapons as Record<string, string>)[p.weapon]} &middot; ${accNames[p.acc] ?? ''}</small></li>`,
      )
      .join('');
    this.screen.innerHTML = `<div class="wrh-panel wrh-center wrh-scroll">
      <h1>${t.code}: <span style="letter-spacing:4px;color:#1fa2ff">${esc(code)}</span>${locked ? ' &#128274;' : ''}</h1>
      <p class="sub">${iAmHost ? '' : t.waiting}</p>
      <label>${t.players} (${players.length}/${MAX_PLAYERS})</label><ul class="wrh-plist">${list}</ul>
      <label>${t.weapon}</label><div class="wrh-weapons">${this.weaponButtons()}</div>
      ${this.optionRows(iAmHost, options.map, options.difficulty)}
      ${iAmHost ? `<button id="wrh-start">${t.start}</button>` : ''}<button id="wrh-invite" class="alt">&#128279; ${t.invite}</button><button id="wrh-leave" class="warn">${t.leave}</button>
    </div>`;
    this.bindWeapons();
    this.bindPreview();
    let map = options.map;
    let difficulty = options.difficulty;
    this.bindGroup('map', (id) => {
      map = Number(id);
      this.h.onOptions(map, difficulty);
    });
    this.bindGroup('diff', (id) => {
      difficulty = Number(id);
      this.h.onOptions(map, difficulty);
    });
    const s = this.screen.querySelector<HTMLElement>('#wrh-start');
    if (s) s.onclick = () => this.h.onStart();
    this.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.h.onLeave();
    const inv = this.screen.querySelector<HTMLElement>('#wrh-invite');
    if (inv) {
      inv.onclick = () => {
        const link = this.inviteLink(code);
        const done = (): void => {
          inv.textContent = '✔ ' + this.t.inviteCopied;
        };
        (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error('no clipboard'))).then(done, () => {
          window.prompt(this.t.invite, link);
        });
      };
    }
  }

  /** Who killed how many (the top killer is the MVP). */
  private squadStats(world: World): string {
    const rows: { s: number; k: number }[] = [];
    for (let s = 0; s < MAX_PLAYERS; s++) if (world.pActive[s]) rows.push({ s, k: world.pPerk[s * PERKS + PERK.Kills]! });
    if (rows.length < 2) return '';
    rows.sort((a, b) => b.k - a.k);
    const t = this.t;
    return rows
      .map((r, i) => `<div class="wrh-statrow"><span class="wrh-dot" style="background:${this.slotColor(r.s)}"></span>${esc(this.playerNames[r.s] ?? 'P' + (r.s + 1))}: <b>${r.k}</b> ${t.squadKills}${i === 0 && r.k > 0 ? ` &middot; &#127942; <b>${t.mvp}</b>` : ''}</div>`)
      .join('');
  }

  showGameOver(world: World, canReplay = false, rec?: { newWave: boolean; newKills: boolean; unlocked: WeaponId[] }): void {
    const t = this.t;
    const names = t.weapons as Record<string, string>;
    const extra = rec
      ? `${rec.newWave || rec.newKills ? `<p style="color:#d8862e;font-weight:800">${t.newBest}</p>` : ''}${rec.unlocked.length ? `<p>&#128275; ${t.unlockedWeapon}: <b>${rec.unlocked.map((w) => names[w]).join(', ')}</b></p>` : ''}`
      : '';
    this.screen.innerHTML = `<div class="wrh-panel wrh-center" style="text-align:center">
      <h1>${t.over}</h1>
      <p>${t.reached} <b>${world.wave}</b> &middot; ${t.kills} <b>${world.kills}</b> &middot; ${t.level} <b>${world.level}</b></p>${extra}
      ${this.squadStats(world)}
      <button id="wrh-again">${t.again}</button>${canReplay ? `<button id="wrh-replay" class="alt">${t.replay}</button>` : ''}
    </div>`;
    const rb = this.screen.querySelector<HTMLElement>('#wrh-replay');
    if (rb) rb.onclick = () => this.h.onReplay();
    this.screen.querySelector<HTMLElement>('#wrh-again')!.onclick = () => this.h.onAgain();
  }

  private buildHud(): void {
    this.hud.innerHTML = `
      <div class="wrh-hurt" id="h-hurt"></div>
      <div class="wrh-top"><div class="big" id="h-wave"></div><div class="wrh-bar"><i id="h-xp"></i></div><div class="wrh-bar boss" id="h-bossbar" style="display:none"><i id="h-boss"></i></div><div id="h-bosslabel" style="display:none;color:#d8362e"></div></div>
      <div class="wrh-squad" id="h-squad"></div>
      <div class="wrh-inv" id="h-inv"></div>
      <canvas class="wrh-mini" id="h-mini" width="360" height="240"></canvas>
      <div class="wrh-reload" id="h-reload"><i></i></div>
      <div class="wrh-me" id="h-me"></div>
      <div class="wrh-banner" id="h-banner" style="display:none"></div>
      <div class="wrh-cards" id="h-cards" style="display:none"></div>
      <div class="wrh-warn" id="h-warn" style="display:none"></div>
      <div class="wrh-hint" id="h-hint"></div>
      <div class="wrh-gear" id="h-gear" title="Settings">&#9881;</div><div class="wrh-gear" id="h-ctl" style="right:54px" title="Controls">&#9000;</div><div class="wrh-hostpause" id="h-hostpause"></div>`;
    this.hud.querySelector<HTMLElement>('#h-gear')!.onclick = () => this.toggleSettings();
    this.hud.querySelector<HTMLElement>('#h-ctl')!.onclick = () => this.toggleControls();
    this.hudBuilt = true;
  }

  clearHud(): void {
    this.hud.innerHTML = '';
    this.hudBuilt = false;
    this.lastCards = '';
  }

  warn(text: string): void {
    const el = this.hud.querySelector<HTMLElement>('#h-warn');
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  /** Big message in the middle for a moment (wave start, boss, revive). */
  private hurtDirEl: HTMLElement | null = null;
  private hurtDirTimer = 0;

  /** A red arc on the screen edge pointing at where the hit came from (angle in screen space, radians). */
  hurtFrom(angle: number): void {
    let el = this.hurtDirEl;
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;transition:opacity .5s ease-out;opacity:0';
      el.innerHTML = '<i style="position:absolute;left:min(34vw,42vh);top:-38px;width:34px;height:76px;border-radius:50%;background:radial-gradient(ellipse at 20% 50%,rgba(220,30,40,.95),rgba(220,30,40,0) 70%)"></i>';
      this.root.appendChild(el);
      this.hurtDirEl = el;
    }
    el.style.transition = 'none';
    el.style.transform = `rotate(${angle}rad)`;
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity .55s ease-out';
    el.style.opacity = '0';
    this.hurtDirTimer = performance.now();
  }

  /** The "paused by the host" notice (online). */
  setHostPause(on: boolean, canResume: boolean): void {
    const el = this.hud.querySelector<HTMLElement>('#h-hostpause');
    if (!el) return;
    el.style.display = on ? 'block' : 'none';
    if (on) el.innerHTML = `&#9208; ${this.t.hostPaused}${canResume ? `<small>${this.t.hostResume}</small>` : ''}`;
  }

  /** A full-screen flash of a colour that fades out (nukes, freezes). */
  screenFlash(color: string, ms: number): void {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:0;background:${color};opacity:.85;pointer-events:none;transition:opacity ${ms}ms ease-out`;
    this.root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
    setTimeout(() => el.remove(), ms + 100);
  }

  banner(text: string, sub = '', ms = 2200): void {
    const el = this.hud.querySelector<HTMLElement>('#h-banner');
    if (!el) return;
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.style.display = 'block';
    this.bannerUntil = performance.now() + ms;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen) this.controlsOpen = false;
    this.renderSettings();
  }

  private settingsTab = 'graphics';
  private settingsScroll = 0;
  private controlsOpen = false;

  /** True while the settings window or the controls sheet is open. */
  get overlayOpen(): boolean {
    return this.settingsOpen || this.controlsOpen;
  }

  /** The controls sheet: every control as keycaps with what it does. */
  toggleControls(): void {
    this.controlsOpen = !this.controlsOpen;
    if (this.controlsOpen) this.settingsOpen = false;
    this.renderSettings();
  }

  private renderSettings(): void {
    if (this.controlsOpen) {
      renderControlsSheet(this.settingsEl, {
        lang: this.lang,
        bindings: this.h.getBindings(),
        onClose: () => this.toggleControls(),
        onSetting: () => undefined,
      });
      return;
    }
    if (!this.settingsOpen) {
      this.settingsEl.innerHTML = '';
      return;
    }
    renderSettingsPanel(this.settingsEl, {
      settings: this.settings,
      lang: this.lang,
      langs: LANGS,
      tab: this.settingsTab,
      scroll: this.settingsScroll,
      actionNames: this.t.actions as Record<string, string>,
      actions: ACTIONS,
      bindings: this.h.getBindings(),
      onSetting: (key, value) => this.h.onSetting(key, value),
      onTab: (tab) => {
        this.settingsTab = tab;
        this.settingsScroll = 0;
        this.renderSettings();
      },
      onRebind: (action) => this.h.onRebind(action, () => this.renderSettings()),
      onResetKeys: () => {
        this.h.onResetKeys();
        this.renderSettings();
      },
      onReset: () => this.h.onResetSettings(),
      onClose: () => this.toggleSettings(),
      onControls: () => this.toggleControls(),
    });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.root.classList.toggle('no-minimap', !s.minimap);
    this.root.classList.toggle('no-tags', !s.nameTags);
    this.root.style.setProperty('--wrh-zoom', String([1, 1.18, 1.38][s.textSize] ?? 1));
    this.lang = s.lang;
    if (this.settingsOpen || this.controlsOpen) this.renderSettings();
    this.lastCards = '';
  }

  private mini: HTMLCanvasElement | null = null;
  private lastMini = 0;

  /** Radar of the whole arena: cover, enemies, loot and the squad (about 12 Hz). */
  drawMinimap(world: World, slot: number, now: number): void {
    if (now - this.lastMini < 80) return;
    this.lastMini = now;
    this.mini ??= this.hud.querySelector<HTMLCanvasElement>('#h-mini');
    const c = this.mini;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const sx = W / (ARENA_HALF_W * 2);
    const sy = H / (ARENA_HALF_H * 2);
    const X = (x: number): number => (x + ARENA_HALF_W) * sx;
    const Y = (y: number): number => (ARENA_HALF_H - y) * sy;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#8b7a5e';
    for (const o of MAPS[world.map]?.boxes ?? MAPS[0]!.boxes) g.fillRect(X(o.x - o.w / 2), Y(o.y + o.h / 2), o.w * sx, o.h * sy);
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!world.kActive[i]) continue;
      g.fillStyle = ['#ffcf3a', '#3ddc6a', '#6b8f4a', '#c06bff'][world.kType[i]!]!;
      g.fillRect(X(world.kX[i]!) - 3, Y(world.kY[i]!) - 3, 6, 6);
    }
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!world.eActive[i]) continue;
      const boss = world.eBoss[i] !== 0;
      g.fillStyle = boss ? '#d8362e' : '#c0443c';
      const r = boss ? 7 : 2.2;
      g.beginPath();
      g.arc(X(world.eX[i]!), Y(world.eY[i]!), r, 0, Math.PI * 2);
      g.fill();
    }
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s] || world.pState[s] === PlayerState.Dead) continue;
      g.fillStyle = this.slotColor(s);
      g.strokeStyle = s === slot ? '#fff' : '#3a352d';
      g.lineWidth = s === slot ? 3 : 1.5;
      g.beginPath();
      g.arc(X(world.pX[s]!), Y(world.pY[s]!), s === slot ? 6 : 4.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /** Update the HUD from the world (throttled to ~12 Hz; cheap DOM writes only). */
  update(world: World, slot: number, hurt: number, now: number, names: string[]): void {
    if (!this.hudBuilt) this.buildHud();
    const hurtEl = this.hud.querySelector<HTMLElement>('#h-hurt')!;
    const myHp = world.pActive[slot] && world.pState[slot] === PlayerState.Alive ? world.pHp[slot]! / world.pMaxHp[slot]! : 1;
    const pulse = myHp < 0.3 ? 0.22 + 0.18 * Math.sin(now / 180) : 0;
    hurtEl.style.opacity = String(Math.min(1, Math.max(hurt, pulse)));
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.hud.querySelector<HTMLElement>('#h-banner')!.style.display = 'none';
    }
    if (now - this.lastHud < 80) return;
    this.lastHud = now;
    const t = this.t;
    const set = (id: string, html: string): void => {
      const el = this.hud.querySelector<HTMLElement>('#' + id)!;
      if (el.innerHTML !== html) el.innerHTML = html;
    };
    const phase = world.misc[MISC.Phase]!;
    const left = world.enemyCount + world.misc[MISC.Remaining]!;
    const bossNext = world.wave % BALANCE.progression.boss.everyWaves === 0;
    const sub = phase === FloorPhase.Fight ? `${left} ${t.enemiesLeft}${bossNext ? ` &middot; <span class="wrh-low">${t.boss}!</span>` : ''}` : phase === FloorPhase.Ascend ? t.climbing : phase === FloorPhase.Cleared ? t.breather : t.getReady;
    set('h-wave', `${t.wave} ${world.wave} &middot; ${t.kills} ${world.kills} &middot; ${t.level} ${world.level}<br><small style="font-weight:600;opacity:.75">${sub}</small>`);
    // the big countdown under the top bar: after a clear (before the climb) and on the new floor (before the fight)
    const secsLeft = Math.max(0, Math.ceil((world.misc[MISC.PhaseEnd]! - world.tick) / TICK_RATE));
    if (phase === FloorPhase.Cleared) this.setFloorCountdown(t.waveCleared, `${t.climbIn}`, secsLeft);
    else if (phase === FloorPhase.Arrive) this.setFloorCountdown(`${t.arrivedTitle} ${world.wave}`, t.getReady, secsLeft);
    else this.setFloorCountdown(null, '', 0);
    (this.hud.querySelector('#h-xp') as HTMLElement).style.width = `${Math.min(100, (world.xp / xpForNext(world)) * 100)}%`;

    // boss bar
    let boss = -1;
    for (let i = 0; i < world.eActive.length; i++) {
      if (world.eActive[i] && world.eBoss[i]) {
        boss = i;
        break;
      }
    }
    const bb = this.hud.querySelector<HTMLElement>('#h-bossbar')!;
    const bl = this.hud.querySelector<HTMLElement>('#h-bosslabel')!;
    bb.style.display = bl.style.display = boss >= 0 ? 'block' : 'none';
    if (boss >= 0) {
      const max = BALANCE.enemies.tank.hp * BALANCE.progression.boss.hpMul * world.hpMul;
      (this.hud.querySelector('#h-boss') as HTMLElement).style.width = `${Math.max(0, Math.min(100, (world.eHp[boss]! / max) * 100))}%`;
      bl.textContent = t.boss;
    }

    // squad: one card per player with a smooth health bar (and its number), shield and the upgrades they carry
    let squad = '';
    const glyph: Record<string, string> = { damage: '⚔', rate: '»', pierce: '↠', crit: '✦', blast: '✹', speed: '➤', hp: '♥', armor: '◈', magnet: '⊛', luck: '♣', scholar: '✎', medic: '✚', quick: '↻', roll: '↺', vampire: 'V' };
    const powerNames = t.powerNames as readonly string[];
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s]) continue;
      const st = world.pState[s]!;
      const maxHp = world.pMaxHp[s]!;
      const frac = st === PlayerState.Alive ? world.pHp[s]! / maxHp : st === PlayerState.Downed ? world.pTimer[s]! / BALANCE.player.downedSeconds : 0;
      const col = this.slotColor(s);
      const down = st === PlayerState.Downed;
      const num = st === PlayerState.Alive ? `${Math.ceil(world.pHp[s]!)}<small>/${Math.round(maxHp)}</small>` : down ? `${Math.ceil(world.pTimer[s]!)}s` : '&#10007;';
      const fill = down ? '#f0a020' : `hsl(${Math.round(Math.max(0, Math.min(1, frac)) * 120)} 72% 46%)`;
      const shield = Math.max(0, Math.min(100, world.pPerk[s * PERKS + PERK.Shield]!));
      let chips = '';
      for (let k = 0; k < POWERS.length; k++) {
        const lv = POWERS[k]!.level(world, s);
        if (lv < 0.005) continue;
        chips += `<span class="chip" style="--c:${POWERS[k]!.color}" title="${esc(powerNames[k] ?? POWERS[k]!.id)}"><i>${glyph[POWERS[k]!.id] ?? '+'}</i>${Math.round(lv * 100)}%</span>`;
      }
      const haste = world.pPerk[s * PERKS + PERK.Haste]!;
      const quad = world.pPerk[s * PERKS + PERK.Quad]!;
      if (haste > 0) chips += `<span class="chip timed" style="--c:#ffd21f"><i>&#9889;</i>${Math.ceil(haste)}s</span>`;
      if (quad > 0) chips += `<span class="chip timed" style="--c:#b45cff"><i>&#10006;4</i>${Math.ceil(quad)}s</span>`;
      squad += `<div class="wrh-pc${s === slot ? ' me' : ''}${frac < 0.3 && st === PlayerState.Alive ? ' low' : ''}" style="--pc:${col};opacity:${st === PlayerState.Dead ? 0.45 : 1}">` +
        `<div class="top"><span class="wrh-dot" style="background:${col}"></span><b>${esc(names[s] ?? 'P' + (s + 1))}</b>${down ? ' &#9760;' : ''}<em>${num}</em></div>` +
        `<div class="bar"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%;background:${fill}"></i>${shield > 0 ? `<s style="width:${shield}%"></s>` : ''}</div>` +
        (chips ? `<div class="chips">${chips}</div>` : '') +
        '</div>';
    }
    set('h-squad', squad);

    // local player
    if (world.pActive[slot]) {
      const wid = WEAPON_IDS[world.pWeapon[slot]!]!;
      const stats = BALANCE.weapons[wid];
      const mag = world.pMag[slot]!;
      const reserve = world.pAmmo[slot]!;
      const reloading = world.pReload[slot]! > 0;
      const low = reserve >= 0 && mag + reserve < stats.ammo * 0.2;
      const dashReady = world.pDashCd[slot]! <= 0;
      const dashText = dashReady ? t.dashReady : `${Math.ceil(world.pDashCd[slot]!)}s`;
      set(
        'h-me',
        `${(t.weapons as Record<string, string>)[wid]} &middot; <span class="${low || (mag === 0 && reserve === 0) ? 'wrh-low' : ''}">${reloading ? t.reloading : `${mag}/${reserve < 0 ? '&infin;' : reserve}`}${low ? ' !' : ''}</span>` +
          ` &middot; &#128163; ${world.pGren[slot]} &middot; <span style="opacity:${dashReady ? 1 : 0.5}">&#9889; ${dashText}</span>`,
      );
      set('h-inv', this.inventoryHtml(world, slot));
      const bar = this.hud.querySelector<HTMLElement>('#h-reload')!;
      bar.style.display = reloading ? 'block' : 'none';
      if (reloading) (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, (1 - world.pReload[slot]! / stats.reload) * 100))}%`;
      const st = world.pState[slot]!;
      if (st === PlayerState.Downed) {
        const sec = Math.ceil(world.pTimer[slot]!);
        this.warn(`${t.downed} ${sec}s`);
        set('h-hint', t.downedHint);
      } else if (st === PlayerState.Dead) {
        this.warn(t.dead);
        set('h-hint', '');
      } else {
        // anyone downed close by?
        let near = false;
        for (let d = 0; d < MAX_PLAYERS; d++) {
          if (d === slot || !world.pActive[d] || world.pState[d] !== PlayerState.Downed) continue;
          const dx = world.pX[d]! - world.pX[slot]!;
          const dy = world.pY[d]! - world.pY[slot]!;
          if (dx * dx + dy * dy < 9) near = true;
        }
        this.warn(near ? t.revive : '');
        set('h-hint', t.controls);
      }
    }

    if (world.gameOver) {
      this.warn('');
      set('h-hint', '');
    }
    // cards
    const cardsEl = this.hud.querySelector<HTMLElement>('#h-cards')!;
    if (world.cardOffer[0]! >= 0 && !world.gameOver) {
      const key = world.cardOffer.join(',') + this.lang;
      if (key !== this.lastCards) {
        this.lastCards = key;
        const cards = t.cards as Record<string, readonly [string, string]>;
        cardsEl.innerHTML =
          `<h3>${t.pick}</h3>` +
          Array.from(world.cardOffer)
            .map((c, i) => {
              const id = CARD_IDS[c]!;
              const rarity = CARD_RARITY[id];
              const personal = PERSONAL_CARDS.includes(id);
              return `<div class="wrh-card r${rarity}" data-i="${i}"><kbd>${i + 1}</kbd><div class="art"><img src="${asset(`cards/${id}.png`)}" alt="" draggable="false"></div><b>${cards[id]![0]}</b><span>${cards[id]![1]}</span><em>${(t.rarity as readonly string[])[rarity]}${personal ? ` &middot; ${t.onlyYou}` : ''}</em></div>`;
            })
            .join('') +
          `<div class="wrh-cardtime"><i id="h-ct"></i></div>`;
        cardsEl.querySelectorAll<HTMLElement>('.wrh-card').forEach((el) => {
          el.onclick = () => this.h.onCard(Number(el.dataset.i));
        });
      }
      cardsEl.style.display = 'block';
      const ct = cardsEl.querySelector<HTMLElement>('#h-ct');
      if (ct) ct.style.width = `${Math.max(0, (world.cardTimer / (BALANCE.progression.cardSeconds * TICK_RATE)) * 100)}%`;
    } else {
      cardsEl.style.display = 'none';
      this.lastCards = '';
    }
  }
}
