import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, CARD_IDS, MAPS, MAX_ENEMIES, MAX_PICKUPS, MAX_PLAYERS, PLAYER_COLORS, PlayerState, TICK_RATE, WEAPON_IDS, type WeaponId } from '@wrh/shared';
import { xpForNext, type World } from '@wrh/sim';
import { ACTIONS, keyLabel } from './input';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, loadRejoin, saveProfile } from './profile';

export type Lang = 'en' | 'tr';

export const UI_STRINGS = {
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
    wave: 'Wave',
    nextWave: 'Next wave in',
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
    settings: 'Settings',
    volume: 'Volume',
    music: 'Music',
    shadows: 'Shadows',
    renderer: 'Renderer (WebGPU falls back to WebGL2 if unavailable)',
    aa: 'Anti-aliasing',
    reloads: 'reloads the page',
    bounce: 'Bounce light (fake GI)',
    on: 'On',
    quality: 'Render scale',
    language: 'Language',
    close: 'Close',
    off: 'Off',
    low: 'Low',
    high: 'High',
    desync: 'Desync detected!',
    connecting: 'Connecting...',
    controls: 'WASD move · mouse aim · click fire · R reload · Shift dash · right-click grenade · E revive · 1-3 cards',
    weapon: 'Starting weapon',
    arena: 'Arena',
    difficulty: 'Difficulty',
    look: 'Look',
    password: 'Room password (optional)',
    rejoin: 'Rejoin the game you left',
    lockedTip: 'Reach wave',
    best: 'Best',
    newBest: 'New record!',
    unlockedWeapon: 'Unlocked',
    reconnecting: 'Connection lost, reconnecting...',
    maps: { '-1': 'Random', '0': 'Warehouse', '1': 'Courtyard', '2': 'Corridors', '3': 'Open field' },
    diffs: ['Easy', 'Normal', 'Hard'],
    accs: ['Bandana', 'Cap', 'Goggles', 'Headphones', 'Helmet'],
    controlsTitle: 'Controls',
    pressKey: 'press a key...',
    resetKeys: 'Reset keys',
    actions: { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', fire: 'Fire', grenade: 'Grenade', revive: 'Revive', reload: 'Reload', dash: 'Dash', card1: 'Card 1', card2: 'Card 2', card3: 'Card 3', pause: 'Pause' },
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
    },
    weapons: { pistol: 'Pistol', smg: 'SMG', ar: 'Assault rifle', shotgun: 'Shotgun', hmg: 'Heavy MG', minigun: 'Minigun', sniper: 'Sniper' },
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
    wave: 'Dalga',
    nextWave: 'Sonraki dalga',
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
    settings: 'Ayarlar',
    volume: 'Ses',
    music: 'Müzik',
    shadows: 'Gölgeler',
    renderer: 'Çizim motoru (WebGPU yoksa WebGL2 kullanılır)',
    aa: 'Kenar yumuşatma',
    reloads: 'sayfayı yeniler',
    bounce: 'Sekme ışığı (sahte GI)',
    on: 'Açık',
    quality: 'Çözünürlük ölçeği',
    language: 'Dil',
    close: 'Kapat',
    off: 'Kapalı',
    low: 'Düşük',
    high: 'Yüksek',
    desync: 'Senkron bozuldu!',
    connecting: 'Bağlanıyor...',
    controls: 'WASD hareket · fare nişan · tık ateş · R doldur · Shift atıl · sağ tık bomba · E kaldır · 1-3 kart',
    weapon: 'Başlangıç silahı',
    arena: 'Arena',
    difficulty: 'Zorluk',
    look: 'Görünüm',
    password: 'Oda şifresi (isteğe bağlı)',
    rejoin: 'Ayrıldığın oyuna geri dön',
    lockedTip: 'Şu dalgaya ulaş:',
    best: 'En iyi',
    newBest: 'Yeni rekor!',
    unlockedWeapon: 'Açıldı',
    reconnecting: 'Bağlantı koptu, yeniden bağlanıyor...',
    maps: { '-1': 'Rastgele', '0': 'Depo', '1': 'Avlu', '2': 'Koridorlar', '3': 'Açık alan' },
    diffs: ['Kolay', 'Normal', 'Zor'],
    accs: ['Bandana', 'Şapka', 'Gözlük', 'Kulaklık', 'Kask'],
    controlsTitle: 'Kontroller',
    pressKey: 'bir tuşa bas...',
    resetKeys: 'Tuşları sıfırla',
    actions: { up: 'Yukarı', down: 'Aşağı', left: 'Sola', right: 'Sağa', fire: 'Ateş', grenade: 'El bombası', revive: 'Kaldır', reload: 'Doldur', dash: 'Atıl', card1: 'Kart 1', card2: 'Kart 2', card3: 'Kart 3', pause: 'Duraklat' },
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
    },
    weapons: { pistol: 'Tabanca', smg: 'SMG', ar: 'Piyade tüfeği', shotgun: 'Pompalı', hmg: 'Ağır MG', minigun: 'Minigun', sniper: 'Keskin nişancı' },
  },
} as const;

export interface UiHandlers {
  onSolo(name: string): void;
  onHost(name: string, server: string, password: string): void;
  onJoin(name: string, code: string, server: string, password: string): void;
  onRejoin(): void;
  onWeapon(weapon: WeaponId): void;
  onLook(acc: number): void;
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
  onSetting(key: 'volume' | 'music' | 'shadows' | 'scale' | 'lang' | 'aa' | 'bounce' | 'renderer' | 'fpsCap' | 'texture' | 'autoScale', value: number | string | boolean): void;
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
  volume: number;
  shadows: 0 | 1 | 2;
  scale: number;
  lang: Lang;
}

const CSS = `
.wrh-ui{position:fixed;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#3a352d}
.wrh-ui *{box-sizing:border-box}
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
.wrh-squad{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:5px}
.wrh-squad div{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600}
.wrh-squad .hp{width:120px;height:9px;border-radius:5px;background:rgba(60,45,20,.22);overflow:hidden}
.wrh-squad .hp>i{display:block;height:100%}
.wrh-me{position:absolute;right:14px;bottom:12px;text-align:right;font-weight:700;font-size:15px;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.wrh-hurt{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(200,20,30,0) 45%,rgba(200,20,30,.55) 100%);opacity:0}
.wrh-banner{position:absolute;left:50%;top:26%;transform:translateX(-50%);text-align:center;font-weight:800;font-size:30px;color:#c8242c;text-shadow:0 2px 0 #fff,0 0 18px rgba(255,255,255,.8)}
.wrh-banner small{display:block;font-size:14px;color:#3a352d;font-weight:600}
.wrh-cards{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);text-align:center;pointer-events:none}
.wrh-cards h3{margin:0 0 8px;text-shadow:0 1px 0 #fff}
.wrh-card{pointer-events:auto;cursor:pointer;display:inline-block;width:170px;vertical-align:top;margin:0 6px;padding:12px;background:#fffaf0;border:3px solid #1fa2ff;border-radius:12px;box-shadow:0 6px 18px rgba(60,45,20,.3);text-align:left}
.wrh-card:hover{transform:translateY(-4px);border-color:#ff9a3a}
.wrh-card b{display:block;font-size:15px}
.wrh-card span{font-size:12px;opacity:.8}
.wrh-card kbd{float:right;background:#1fa2ff;color:#fff;border-radius:5px;padding:0 6px;font-size:12px}
.wrh-cardtime{width:200px;height:6px;background:rgba(60,45,20,.2);border-radius:4px;margin:8px auto 0;overflow:hidden}
.wrh-cardtime>i{display:block;height:100%;background:#ff9a3a}
.wrh-gear{position:absolute;right:12px;top:10px;pointer-events:auto;cursor:pointer;width:34px;height:34px;border-radius:50%;background:rgba(250,244,232,.9);border:2px solid #cdbfa5;text-align:center;line-height:30px;font-size:18px}
.wrh-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);font-size:12px;opacity:.7;text-shadow:0 1px 0 #fff}
.wrh-warn{position:absolute;left:50%;top:60px;transform:translateX(-50%);color:#fff;background:#d8362e;padding:4px 12px;border-radius:8px;font-weight:700}
.wrh-mini{position:absolute;right:14px;bottom:52px;width:180px;height:120px;border:2px solid #cdbfa5;border-radius:8px;background:rgba(250,244,232,.78);box-shadow:0 3px 10px rgba(60,45,20,.25)}
.wrh-dmg{position:absolute;font-weight:800;font-size:15px;color:#fff;text-shadow:0 0 3px #7d0d14,0 0 3px #7d0d14,0 1px 0 #7d0d14;pointer-events:none;will-change:transform,opacity}
.wrh-tag{position:absolute;transform:translate(-50%,-100%);font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(250,244,232,.85);border:2px solid;white-space:nowrap;pointer-events:none}
.wrh-reload{position:absolute;right:14px;bottom:36px;width:180px;height:6px;border-radius:4px;background:rgba(60,45,20,.25);overflow:hidden;display:none}
.wrh-reload>i{display:block;height:100%;background:#ff9a3a;width:0}
.wrh-scroll{max-height:92vh;overflow:auto}
.wrh-ui button.wrh-wp:disabled{opacity:.45;cursor:not-allowed}
.wrh-keys{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:4px 0 8px;font-size:12px}
.wrh-keys button{margin:0;padding:3px 8px;font-size:12px;background:#e6dcc8;color:#3a352d}
.wrh-low{color:#d8362e}
.wrh-hud-dev{position:absolute;left:12px;top:10px;font-size:12px;line-height:1.5}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** DOM overlay: menu, lobby, HUD, cards, down/dead/game-over screens, settings. */
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
  tr(key: 'noServer' | 'noConnect' | 'connLost' | 'desync' | 'reconnecting'): string {
    return (this.t as unknown as Record<string, string>)[key]!;
  }

  private get t(): (typeof UI_STRINGS)['en'] {
    return UI_STRINGS[this.lang] as (typeof UI_STRINGS)['en'];
  }

  setDev(html: string): void {
    this.dev.innerHTML = html;
  }

  clearScreen(): void {
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

  private mapItems(): { id: string; label: string }[] {
    const names = this.t.maps as Record<string, string>;
    return ['-1', '0', '1', '2', '3'].map((id) => ({ id, label: names[id]! }));
  }

  private bindGroup(attr: string, pick: (id: string) => void): void {
    this.screen.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.onclick = () => {
        pick(el.getAttribute(`data-${attr}`)!);
        this.screen.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === el));
      };
    });
  }

  private persistLook(): void {
    const p = loadProfile();
    p.acc = this.acc;
    p.map = this.map;
    p.difficulty = this.difficulty;
    saveProfile(p);
  }

  /** Option rows shared by the menu and the lobby: arena and difficulty (host or solo) and the player's look. */
  private optionRows(editable: boolean, map: number, difficulty: number): string {
    const t = this.t;
    const names = t.accs as readonly string[];
    const accs = ACCESSORIES.map((_, i) => ({ id: String(i), label: names[i]! }));
    const diffs = (t.diffs as readonly string[]).map((label, i) => ({ id: String(i), label }));
    return (
      `<label>${t.look}</label><div class="wrh-weapons">${this.group(accs, String(this.acc), 'acc')}</div>` +
      (editable
        ? `<label>${t.arena}</label><div class="wrh-weapons">${this.group(this.mapItems(), String(map), 'map')}</div>` +
          `<label>${t.difficulty}</label><div class="wrh-weapons">${this.group(diffs, String(difficulty), 'diff')}</div>`
        : `<label>${t.arena}: <b>${(t.maps as Record<string, string>)[String(map)]}</b> &middot; ${t.difficulty}: <b>${(t.diffs as readonly string[])[difficulty]}</b></label>`)
    );
  }

  showMenu(error = ''): void {
    const t = this.t;
    const profile = loadProfile();
    this.acc = profile.acc;
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
    const fromParam = new URLSearchParams(location.search).get('server');
    const hosted = location.hostname.endsWith('github.io');
    const defServer = fromParam ?? (stored || (hosted ? '' : location.port === '5173' ? `ws://${location.hostname}:8787/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`));
    const rejoin = loadRejoin();
    this.screen.innerHTML = `<div class="wrh-panel wrh-center wrh-scroll">
      <h1>${t.title}</h1><p class="sub">${t.tag} &middot; ${t.best}: ${profile.bestWave} / ${profile.bestKills}</p>
      <label>${t.name}</label><input id="wrh-name" maxlength="16" value="${esc(saved)}" placeholder="player">
      <label>${t.weapon}</label><div class="wrh-weapons" id="wrh-weapons">${this.weaponButtons()}</div>
      ${this.optionRows(true, this.map, this.difficulty)}
      <button id="wrh-solo">${t.solo}</button>
      <button id="wrh-host" class="alt">${t.host}</button>
      ${rejoin ? `<button id="wrh-rejoin" class="alt">${t.rejoin} (${esc(rejoin.code)})</button>` : ''}
      <div class="wrh-row"><div style="flex:1"><label>${t.code}</label><input id="wrh-code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD"></div><button id="wrh-join" class="alt">${t.join}</button></div>
      <label>${t.password}</label><input id="wrh-pass" maxlength="24" autocomplete="off">
      <label>${t.server}</label><input id="wrh-server" value="${esc(defServer)}" placeholder="wss://your-tunnel.example.com/ws">
      <p class="sub" style="margin:6px 0 0">${t.controls}</p>
      ${error ? `<p style="color:#c8242c;font-weight:700">${esc(error)}</p>` : ''}
    </div>`;
    this.bindWeapons();
    this.bindGroup('acc', (id) => {
      this.acc = Number(id);
      this.persistLook();
      this.h.onLook(this.acc);
    });
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

  showConnecting(): void {
    this.screen.innerHTML = `<div class="wrh-panel wrh-center"><h1>${this.t.connecting}</h1></div>`;
  }

  showLobby(
    code: string,
    players: { slot: number; name: string; host: boolean; connected: boolean; weapon: WeaponId; acc: number }[],
    iAmHost: boolean,
    options: { map: number; difficulty: number } = { map: 0, difficulty: 1 },
    locked = false,
  ): void {
    const t = this.t;
    const accNames = t.accs as readonly string[];
    const list = players
      .map(
        (p) =>
          `<li><span class="wrh-dot" style="background:${PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"></span>${esc(p.name)} ${p.host ? `<small>(${t.host_tag})</small>` : ''} <small style="opacity:.7">&middot; ${(t.weapons as Record<string, string>)[p.weapon]} &middot; ${accNames[p.acc] ?? ''}</small></li>`,
      )
      .join('');
    this.screen.innerHTML = `<div class="wrh-panel wrh-center wrh-scroll">
      <h1>${t.code}: <span style="letter-spacing:4px;color:#1fa2ff">${esc(code)}</span>${locked ? ' &#128274;' : ''}</h1>
      <p class="sub">${iAmHost ? '' : t.waiting}</p>
      <label>${t.players} (${players.length}/${MAX_PLAYERS})</label><ul class="wrh-plist">${list}</ul>
      <label>${t.weapon}</label><div class="wrh-weapons">${this.weaponButtons()}</div>
      ${this.optionRows(iAmHost, options.map, options.difficulty)}
      ${iAmHost ? `<button id="wrh-start">${t.start}</button>` : ''}<button id="wrh-leave" class="warn">${t.leave}</button>
    </div>`;
    this.bindWeapons();
    this.bindGroup('acc', (id) => {
      this.acc = Number(id);
      this.persistLook();
      this.h.onLook(this.acc);
    });
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
      <canvas class="wrh-mini" id="h-mini" width="360" height="240"></canvas>
      <div class="wrh-reload" id="h-reload"><i></i></div>
      <div class="wrh-me" id="h-me"></div>
      <div class="wrh-banner" id="h-banner" style="display:none"></div>
      <div class="wrh-cards" id="h-cards" style="display:none"></div>
      <div class="wrh-warn" id="h-warn" style="display:none"></div>
      <div class="wrh-hint" id="h-hint"></div>
      <div class="wrh-gear" id="h-gear">&#9881;</div>`;
    this.hud.querySelector<HTMLElement>('#h-gear')!.onclick = () => this.toggleSettings();
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
  banner(text: string, sub = '', ms = 2200): void {
    const el = this.hud.querySelector<HTMLElement>('#h-banner');
    if (!el) return;
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.style.display = 'block';
    this.bannerUntil = performance.now() + ms;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.renderSettings();
  }

  private keyRows(): string {
    const b = this.h.getBindings();
    const names = this.t.actions as Record<string, string>;
    return ACTIONS.map((a) => `<span>${names[a]}</span><button type="button" data-act="${a}">${esc((b[a] ?? []).map(keyLabel).join(' / '))}</button>`).join('');
  }

  private renderSettings(): void {
    if (!this.settingsOpen) {
      this.settingsEl.innerHTML = '';
      return;
    }
    const t = this.t;
    const s = this.settings;
    this.settingsEl.innerHTML = `<div class="wrh-panel wrh-center wrh-scroll">
      <h1 style="font-size:22px">${t.settings}</h1>
      <label>${t.volume}</label><input id="s-vol" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}">
      <label>${t.music}</label><input id="s-mus" type="range" min="0" max="100" value="${Math.round(s.music * 100)}">
      <label>${t.shadows}</label><input id="s-sh" type="range" min="0" max="2" step="1" value="${s.shadows}">
      <label>${t.quality} (${s.scale.toFixed(2)})</label><input id="s-sc" type="range" min="50" max="100" step="5" value="${Math.round(s.scale * 100)}">
      <label>${t.renderer} <small>(${t.reloads})</small></label><div class="wrh-row">${(['webgl', 'webgpu'] as const).map((m) => `<button class="wrh-wp${s.renderer === m ? ' on' : ''}" data-rd="${m}">${m === 'webgl' ? 'WebGL2' : 'WebGPU'}</button>`).join('')}</div>
      <label>${t.aa} <small>(${t.reloads})</small></label><div class="wrh-row">${(['off', 'msaa', 'smaa'] as const).map((m) => `<button class="wrh-wp${s.aa === m ? ' on' : ''}" data-aa="${m}">${m === 'off' ? t.off : m.toUpperCase()}</button>`).join('')}</div>
      <label>${t.bounce}</label><div class="wrh-row"><button class="wrh-wp${s.bounce ? ' on' : ''}" id="s-bn1">${t.on}</button><button class="wrh-wp${!s.bounce ? ' on' : ''}" id="s-bn0">${t.off}</button></div>
      <label>${t.controlsTitle}</label><div class="wrh-keys" id="s-keys">${this.keyRows()}</div><button class="alt" id="s-resetkeys">${t.resetKeys}</button>
      <label>${t.fpsCap}</label><div class="wrh-row">${([0, 30, 60, 120] as const).map((v) => `<button class="wrh-wp${s.fpsCap === v ? ' on' : ''}" data-fps="${v}">${v === 0 ? t.unlimited : v}</button>`).join('')}</div>
      <label>${t.texture} <small>(${t.reloads})</small></label><div class="wrh-row"><button class="wrh-wp${s.texture === 0 ? ' on' : ''}" data-tex="0">${t.low}</button><button class="wrh-wp${s.texture === 1 ? ' on' : ''}" data-tex="1">${t.high}</button></div>
      <label>${t.autoScale}</label><div class="wrh-row"><button class="wrh-wp${s.autoScale ? ' on' : ''}" id="s-as1">${t.on}</button><button class="wrh-wp${!s.autoScale ? ' on' : ''}" id="s-as0">${t.off}</button></div>
      <label>${t.language}</label><div class="wrh-row"><button class="alt" id="s-en">English</button><button class="alt" id="s-tr">Türkçe</button></div>
      <button id="s-close">${t.close}</button>
    </div>`;
    const q = <E extends HTMLInputElement>(id: string): E => this.settingsEl.querySelector<E>('#' + id)!;
    q('s-vol').oninput = (e) => this.h.onSetting('volume', Number((e.target as HTMLInputElement).value) / 100);
    q('s-mus').oninput = (e) => this.h.onSetting('music', Number((e.target as HTMLInputElement).value) / 100);
    q('s-sh').oninput = (e) => this.h.onSetting('shadows', Number((e.target as HTMLInputElement).value));
    q('s-sc').oninput = (e) => this.h.onSetting('scale', Number((e.target as HTMLInputElement).value) / 100);
    this.settingsEl.querySelectorAll<HTMLElement>('[data-aa]').forEach((el) => {
      el.onclick = () => this.h.onSetting('aa', el.dataset.aa!);
    });
    this.settingsEl.querySelectorAll<HTMLElement>('[data-rd]').forEach((el) => {
      el.onclick = () => this.h.onSetting('renderer', el.dataset.rd!);
    });
    q('s-bn1').onclick = () => this.h.onSetting('bounce', true);
    q('s-bn0').onclick = () => this.h.onSetting('bounce', false);
    this.settingsEl.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.onclick = () => {
        el.textContent = this.t.pressKey;
        this.h.onRebind(el.dataset.act!, () => this.renderSettings());
      };
    });
    this.settingsEl.querySelector<HTMLElement>('#s-resetkeys')!.onclick = () => {
      this.h.onResetKeys();
      this.renderSettings();
    };
    this.settingsEl.querySelectorAll<HTMLElement>('[data-fps]').forEach((el) => {
      el.onclick = () => this.h.onSetting('fpsCap', Number(el.dataset.fps));
    });
    this.settingsEl.querySelectorAll<HTMLElement>('[data-tex]').forEach((el) => {
      el.onclick = () => this.h.onSetting('texture', Number(el.dataset.tex));
    });
    q('s-as1').onclick = () => this.h.onSetting('autoScale', true);
    q('s-as0').onclick = () => this.h.onSetting('autoScale', false);
    q('s-en').onclick = () => this.h.onSetting('lang', 'en');
    q('s-tr').onclick = () => this.h.onSetting('lang', 'tr');
    q('s-close').onclick = () => this.toggleSettings();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.lang = s.lang;
    if (this.settingsOpen) this.renderSettings();
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
      g.fillStyle = PLAYER_COLORS[s % PLAYER_COLORS.length]!;
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
    const nextIn = Math.max(0, Math.ceil(BALANCE.waves.periodSeconds - (world.tick - world.waveTick) / TICK_RATE));
    const bossNext = (world.wave + 1) % BALANCE.progression.boss.everyWaves === 0;
    set('h-wave', `${t.wave} ${world.wave} &middot; ${t.kills} ${world.kills} &middot; ${t.level} ${world.level}<br><small style="font-weight:600;opacity:.75">${t.nextWave} ${nextIn}s${bossNext ? ` &middot; <span class="wrh-low">${t.boss}!</span>` : ''}</small>`);
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

    // squad
    let squad = '';
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s]) continue;
      const st = world.pState[s]!;
      const frac = st === PlayerState.Alive ? world.pHp[s]! / world.pMaxHp[s]! : st === PlayerState.Downed ? world.pTimer[s]! / BALANCE.player.downedSeconds : 0;
      const col = PLAYER_COLORS[s % PLAYER_COLORS.length]!;
      const tag = st === PlayerState.Downed ? ' &#9760;' : st === PlayerState.Dead ? ' &#10007;' : '';
      squad += `<div style="opacity:${st === PlayerState.Dead ? 0.45 : 1}"><span class="wrh-dot" style="background:${col}"></span>${esc(names[s] ?? 'P' + (s + 1))}${tag}<span class="hp"><i style="width:${Math.max(0, frac * 100)}%;background:${st === PlayerState.Downed ? '#e8a020' : '#3dd66a'}"></i></span></div>`;
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
            .map((c, i) => `<div class="wrh-card" data-i="${i}"><kbd>${i + 1}</kbd><b>${cards[CARD_IDS[c]!]![0]}</b><span>${cards[CARD_IDS[c]!]![1]}</span></div>`)
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
