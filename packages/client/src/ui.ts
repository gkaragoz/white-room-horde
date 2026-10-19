import { BALANCE, CARD_IDS, MAX_PLAYERS, PLAYER_COLORS, PlayerState, TICK_RATE, WEAPON_IDS } from '@wrh/shared';
import { xpForNext, type World } from '@wrh/sim';

export type Lang = 'en' | 'tr';

const T = {
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
    pick: 'Level up! Pick a card',
    settings: 'Settings',
    volume: 'Volume',
    shadows: 'Shadows',
    quality: 'Render scale',
    language: 'Language',
    close: 'Close',
    off: 'Off',
    low: 'Low',
    high: 'High',
    desync: 'Desync detected!',
    connecting: 'Connecting...',
    controls: 'WASD move · mouse aim · click/space fire · right-click/G grenade · E revive · 1-3 cards',
    ammo: 'Ammo',
    grenades: 'Grenades',
    cards: {
      damage: ['Heavy rounds', '+15% damage for everyone'],
      rate: ['Quick fingers', '+12% fire rate for everyone'],
      speed: ['Running shoes', '+8% move speed for everyone'],
      hp: ['Thick vests', '+20 max HP for everyone'],
      pierce: ['Piercing tips', 'Bullets pass through +1 enemy'],
      arsenal: ['New toys', 'Everyone upgrades to the next weapon'],
      heal: ['First aid', 'Heal everyone to full'],
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
    pick: 'Seviye atladın! Bir kart seç',
    settings: 'Ayarlar',
    volume: 'Ses',
    shadows: 'Gölgeler',
    quality: 'Çözünürlük ölçeği',
    language: 'Dil',
    close: 'Kapat',
    off: 'Kapalı',
    low: 'Düşük',
    high: 'Yüksek',
    desync: 'Senkron bozuldu!',
    connecting: 'Bağlanıyor...',
    controls: 'WASD hareket · fare nişan · tık/boşluk ateş · sağ tık/G el bombası · E kaldır · 1-3 kart',
    ammo: 'Mermi',
    grenades: 'Bomba',
    cards: {
      damage: ['Ağır mermiler', 'Herkese +%15 hasar'],
      rate: ['Çevik parmaklar', 'Herkese +%12 ateş hızı'],
      speed: ['Koşu ayakkabısı', 'Herkese +%8 hız'],
      hp: ['Kalın yelekler', 'Herkese +20 azami can'],
      pierce: ['Delici uçlar', 'Mermiler +1 düşmanı deler'],
      arsenal: ['Yeni oyuncaklar', 'Herkes bir sonraki silaha geçer'],
      heal: ['İlk yardım', 'Herkesin canı tam dolar'],
    },
    weapons: { pistol: 'Tabanca', smg: 'SMG', ar: 'Piyade tüfeği', shotgun: 'Pompalı', hmg: 'Ağır MG', minigun: 'Minigun', sniper: 'Keskin nişancı' },
  },
} as const;

export interface UiHandlers {
  onSolo(name: string): void;
  onHost(name: string, server: string): void;
  onJoin(name: string, code: string, server: string): void;
  onStart(): void;
  onLeave(): void;
  onCard(index: number): void;
  onAgain(): void;
  onSetting(key: 'volume' | 'shadows' | 'scale' | 'lang', value: number | string): void;
}

export interface Settings {
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
.wrh-hud-dev{position:absolute;left:12px;top:10px;font-size:12px;line-height:1.5}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** DOM overlay: menu, lobby, HUD, cards, down/dead/game-over screens, settings. */
export class Ui {
  readonly root = document.createElement('div');
  lang: Lang = 'en';
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
    parent.appendChild(this.root);
  }

  private get t(): (typeof T)['en'] {
    return T[this.lang] as (typeof T)['en'];
  }

  setDev(html: string): void {
    this.dev.innerHTML = html;
  }

  clearScreen(): void {
    this.screen.innerHTML = '';
  }

  showMenu(error = ''): void {
    const t = this.t;
    const saved = (() => {
      try {
        return localStorage.getItem('wrh.name') ?? '';
      } catch {
        return '';
      }
    })();
    const defServer = location.port === '5173' ? `ws://${location.hostname}:8787/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.screen.innerHTML = `<div class="wrh-panel wrh-center">
      <h1>${t.title}</h1><p class="sub">${t.tag}</p>
      <label>${t.name}</label><input id="wrh-name" maxlength="16" value="${esc(saved)}" placeholder="player">
      <button id="wrh-solo">${t.solo}</button>
      <button id="wrh-host" class="alt">${t.host}</button>
      <div class="wrh-row"><div style="flex:1"><label>${t.code}</label><input id="wrh-code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD"></div><button id="wrh-join" class="alt">${t.join}</button></div>
      <label>${t.server}</label><input id="wrh-server" value="${esc(defServer)}">
      <p class="sub" style="margin:6px 0 0">${t.controls}</p>
      ${error ? `<p style="color:#c8242c;font-weight:700">${esc(error)}</p>` : ''}
    </div>`;
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
    q('wrh-solo').onclick = () => this.h.onSolo(name());
    q('wrh-host').onclick = () => this.h.onHost(name(), q<HTMLInputElement>('wrh-server').value.trim());
    q('wrh-join').onclick = () => this.h.onJoin(name(), q<HTMLInputElement>('wrh-code').value.trim().toUpperCase(), q<HTMLInputElement>('wrh-server').value.trim());
  }

  showConnecting(): void {
    this.screen.innerHTML = `<div class="wrh-panel wrh-center"><h1>${this.t.connecting}</h1></div>`;
  }

  showLobby(code: string, players: { slot: number; name: string; host: boolean; connected: boolean }[], iAmHost: boolean): void {
    const t = this.t;
    const list = players.map((p) => `<li><span class="wrh-dot" style="background:${PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"></span>${esc(p.name)} ${p.host ? `<small>(${t.host_tag})</small>` : ''}</li>`).join('');
    this.screen.innerHTML = `<div class="wrh-panel wrh-center">
      <h1>${t.code}: <span style="letter-spacing:4px;color:#1fa2ff">${esc(code)}</span></h1>
      <p class="sub">${iAmHost ? '' : t.waiting}</p>
      <label>${t.players} (${players.length}/${MAX_PLAYERS})</label><ul class="wrh-plist">${list}</ul>
      ${iAmHost ? `<button id="wrh-start">${t.start}</button>` : ''}<button id="wrh-leave" class="warn">${t.leave}</button>
    </div>`;
    const s = this.screen.querySelector<HTMLElement>('#wrh-start');
    if (s) s.onclick = () => this.h.onStart();
    this.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.h.onLeave();
  }

  showGameOver(world: World): void {
    const t = this.t;
    this.screen.innerHTML = `<div class="wrh-panel wrh-center" style="text-align:center">
      <h1>${t.over}</h1>
      <p>${t.reached} <b>${world.wave}</b> &middot; ${t.kills} <b>${world.kills}</b> &middot; ${t.level} <b>${world.level}</b></p>
      <button id="wrh-again">${t.again}</button>
    </div>`;
    this.screen.querySelector<HTMLElement>('#wrh-again')!.onclick = () => this.h.onAgain();
  }

  private buildHud(): void {
    this.hud.innerHTML = `
      <div class="wrh-hurt" id="h-hurt"></div>
      <div class="wrh-top"><div class="big" id="h-wave"></div><div class="wrh-bar"><i id="h-xp"></i></div><div class="wrh-bar boss" id="h-bossbar" style="display:none"><i id="h-boss"></i></div><div id="h-bosslabel" style="display:none;color:#d8362e"></div></div>
      <div class="wrh-squad" id="h-squad"></div>
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

  private renderSettings(): void {
    if (!this.settingsOpen) {
      this.settingsEl.innerHTML = '';
      return;
    }
    const t = this.t;
    const s = this.settings;
    this.settingsEl.innerHTML = `<div class="wrh-panel wrh-center">
      <h1 style="font-size:22px">${t.settings}</h1>
      <label>${t.volume}</label><input id="s-vol" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}">
      <label>${t.shadows}</label><input id="s-sh" type="range" min="0" max="2" step="1" value="${s.shadows}">
      <label>${t.quality} (${s.scale.toFixed(2)})</label><input id="s-sc" type="range" min="50" max="100" step="5" value="${Math.round(s.scale * 100)}">
      <label>${t.language}</label><div class="wrh-row"><button class="alt" id="s-en">English</button><button class="alt" id="s-tr">Türkçe</button></div>
      <button id="s-close">${t.close}</button>
    </div>`;
    const q = <E extends HTMLInputElement>(id: string): E => this.settingsEl.querySelector<E>('#' + id)!;
    q('s-vol').oninput = (e) => this.h.onSetting('volume', Number((e.target as HTMLInputElement).value) / 100);
    q('s-sh').oninput = (e) => this.h.onSetting('shadows', Number((e.target as HTMLInputElement).value));
    q('s-sc').oninput = (e) => this.h.onSetting('scale', Number((e.target as HTMLInputElement).value) / 100);
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

  /** Update the HUD from the world (throttled to ~12 Hz; cheap DOM writes only). */
  update(world: World, slot: number, hurt: number, now: number, names: string[]): void {
    if (!this.hudBuilt) this.buildHud();
    const hurtEl = this.hud.querySelector<HTMLElement>('#h-hurt')!;
    hurtEl.style.opacity = String(Math.min(1, hurt));
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
    set('h-wave', `${t.wave} ${world.wave} &middot; ${t.kills} ${world.kills} &middot; ${t.level} ${world.level}`);
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
      const ammo = world.pAmmo[slot]!;
      set('h-me', `${(t.weapons as Record<string, string>)[wid]}${ammo >= 0 ? ` &middot; ${t.ammo} ${ammo}` : ' &infin;'} &middot; &#128163; ${world.pGren[slot]}`);
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

    // cards
    const cardsEl = this.hud.querySelector<HTMLElement>('#h-cards')!;
    if (world.cardOffer[0]! >= 0) {
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
