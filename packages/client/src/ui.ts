import { viewOf } from './view/worldView';
import { LANGS, UI_STRINGS, type Lang } from './uiStrings';
import { CSS } from './uiStyles';
import { esc } from './htmlUtil';
import { arenaThumb } from './arenaThumb';
import { Minimap } from './minimap';
import { inventoryHtml, weaponStatBars } from './weaponHtml';
import { WorldOverlay } from './worldOverlay';

export { LANGS, UI_STRINGS, type Lang };
import { icon, chipIcon } from './icons';
import { lobbyMarkup, menuMarkup } from './menu';
import { autoOpenReleaseNotes } from './releaseNotes';
import { droneNeed } from '@wrh/sim';
import { POWERS } from './render/power';
import { BALANCE, Difficulty, CLASS_IDS, MELEE_CLASSES, FloorPhase, MISC, CARD_IDS, CARD_RARITY, TEAM_CARDS, MAPS, MAX_PLAYERS, PLAYER_COLORS, PERK, PERKS, PlayerState, TICK_RATE, WEAPON_IDS, GAME_VERSION, compatibleVersions, type WeaponId, DRONE_TYPES, DRONE_MAX_LEVEL, DRONE_TIER_LEVELS } from '@wrh/shared';
import { modFx, xpForNext, type World } from '@wrh/sim';
import { asset } from './assets';
import { ACTIONS } from './input';
import { modsCardIcon, modsPanel, modsRow, modsSummary } from './modsUi';
import { achWords, isGot, markSeen, unreadCount } from './achievements';
import { achPage, runAchievementsHtml } from './achUi';
import { ACHIEVEMENTS, type AchievementDef } from '@wrh/shared';
import { renderGameOver, type RunExtras } from './gameOver';
import { renderSettingsPanel } from './settingsPanel';
import { discoverRelay } from './relay';
import { Preview } from './render/preview';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, loadRejoin, saveProfile } from './profile';

export interface UiHandlers {
  onSolo(name: string): void;
  onHost(name: string, server: string, password: string): void;
  onJoin(name: string, code: string, server: string, password: string): void;
  onRejoin(): void;
  onWeapon(weapon: WeaponId): void;
  /** A weapon of the in-game list was clicked (its WEAPON_IDS index + 1). */
  onSlot(wsel: number): void;
  onLook(acc: number, color: number, cls: number): void;
  getBindings(): Record<string, string[]>;
  onRebind(action: string, done: () => void): void;
  onResetKeys(): void;
  onOptions(map: number, mods: number): void;
  onStart(): void;
  onLeave(): void;
  onCard(index: number): void;
  /** The player picked a drone (DRONE_TYPES index) from the inventory list. */
  onDrone?(type: number): void;
  onAgain(): void;
  onResume(): void;
  onUiSound(name: 'click' | 'confirm' | 'back' | 'error' | 'open' | 'close'): void;
  onSetting(key: keyof Settings, value: number | string | boolean): void;
  onResetSettings(): void;
  /** Download the problem report. */
  onReport?(): void;
  /** The setting differs from what the running renderer was built with. */
  needsReload?(key: string): boolean;
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

/** DOM overlay: menu, lobby, HUD, cards, down/dead/game-over screens, settings. */
/** One emoji per class for the picker. */
const CLASS_ICON = (i: number): string => icon(`class_${i}`, 40);

export class Ui {
  readonly root = document.createElement('div');
  /** Names, arrows, rings and numbers drawn over the world. */
  readonly overlay = new WorldOverlay(this.root);
  /** The radar in the HUD corner. */
  readonly minimap = new Minimap(
    () => this.hud.querySelector<HTMLCanvasElement>('#h-mini'),
    (slot) => this.slotColor(slot),
  );
  lang: Lang = 'en';
  /** Starting weapon chosen in the menu or lobby. */
  weapon: WeaponId = 'pistol';
  /** Arena (-1 random) and difficulty picked for solo games. */
  map = -1;
  mods = 0;
  /** Accessory index. */
  acc = 0;
  /** Vest colour index (-1: the slot's own colour). */
  color = -1;
  /** Class index (see CLASS_IDS). */
  cls = Math.max(0, Math.min(CLASS_IDS.length - 1, loadProfile().cls | 0)); // (also the class of a game that starts without showing the menu)
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
  private readonly toolbar = document.createElement('div');
  private langPop: HTMLElement | null = null;
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
    document.documentElement.lang = this.lang;
    this.hud.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.dev.className = 'wrh-hud-dev';
    this.infoEl.className = 'wrh-info';
    this.bindRelicTips();
    this.root.append(this.hud, this.dev, this.screen, this.settingsEl, this.toolbar, this.infoEl, this.relicEl, this.tipEl);
    this.buildToolbar();
    // every button gets a click sound; the important ones a confirmation
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button, .wrh-card');
      if (!b) return;
      if (b.classList.contains('wrh-tbtn')) this.h.onUiSound('open');
      else if (['wrh-solo', 'wrh-host', 'wrh-join', 'wrh-start', 'wrh-again'].includes(b.id) || b.classList.contains('wrh-card')) this.h.onUiSound('confirm');
      else if (['wrh-leave', 's-close'].includes(b.id)) this.h.onUiSound('back');
      else this.h.onUiSound('click');
    });
    parent.appendChild(this.root);
  }

  /** Damage dealt per character over the last seconds, for the live DPS in the squad cards. */
  private readonly dmgHist: { t: number; v: number }[][] = Array.from({ length: MAX_PLAYERS }, () => []);
  private lastWorld: World | null = null;
  private squadTip: { kind: 'pc' | 'chip'; slot: number; k: number } | null = null;
  private gearInfo = { abName: '', cls: 0 };
  private readonly hudHtml = new Map<string, string>();
  /** A one-off tooltip (gear, toolbar): its html while it is shown by the hover handlers below. */
  private hoverTip: (() => string) | null = null;
  private lastNow = 0;
  private startNow = -1;

  private dpsOf(world: World, s: number, now: number): number {
    const total = world.pPerk[s * PERKS + PERK.Damage]!;
    const h = this.dmgHist[s]!;
    const last = h[h.length - 1];
    if (!last || now - last.t >= 250 || total < last.v) {
      if (last && total < last.v) h.length = 0; // a new game in the same page
      h.push({ t: now, v: total });
      while (h.length > 2 && now - h[1]!.t > 5000) h.shift();
    }
    const first = h[0]!;
    const span = Math.max(1000, Math.min(5000, now - first.t));
    return Math.max(0, (total - first.v) / (span / 1000));
  }

  private squadTipHtml(world: World): string {
    const tip = this.squadTip;
    if (!tip || !world.pActive[tip.slot]) return '';
    const t = this.t;
    const s = tip.slot;
    if (tip.kind === 'chip') {
      const p = POWERS[tip.k];
      if (!p) return '';
      const name = (t.powerNames as readonly string[])[tip.k] ?? p.id;
      return `<b>${esc(name)}</b><span>+${Math.round(p.level(world, s) * 100)}%</span>`;
    }
    const cls = world.pPerk[s * PERKS + PERK.Class]!;
    const className = (t.classNames as readonly string[])[cls] ?? '';
    const classTip = (t.classTips as readonly string[])[cls] ?? '';
    const dmg = world.pPerk[s * PERKS + PERK.Damage]!;
    const kills = world.pPerk[s * PERKS + PERK.Kills]!;
    const secs = Math.max(1, (this.lastNow - Math.max(0, this.startNow)) / 1000);
    this.tipEl.style.setProperty('--rc', this.slotColor(s));
    return (
      `<b>${esc(this.playerNames[s] ?? 'P' + (s + 1))} &middot; ${esc(className)}</b><span>${esc(classTip)}</span>` +
      `<span>${t.lvShort} ${world.pLevel[s]} &middot; ${t.xpTip} ${Math.floor(world.pXp[s]!)}/${Math.floor(xpForNext(world, s))}</span>` +
      `<span>${t.killsTip}: ${Math.round(kills)} &middot; ${t.dmgTotal}: ${Math.round(dmg).toLocaleString()}</span>` +
      `<span>${t.avgDps}: ${Math.round(dmg / secs)}</span>`
    );
  }

  private readonly relicEl = document.createElement('div');
  private readonly tipEl = document.createElement('div');
  private lastRelics = '';

  /** The cards the local character took, as small icons bottom centre (stacked with a count); hover shows what each does. */
  private updateRelics(world: World, slot: number): void {
    const n = CARD_IDS.length;
    const counts: number[] = [];
    for (let i = 0; i < n; i++) counts.push(world.pCards[slot * n + i]!);
    const key = counts.join(',') + this.lang;
    if (key === this.lastRelics) return;
    this.lastRelics = key;
    const t = this.t;
    const cards = t.cards as Record<string, readonly [string, string]>;
    const rarityColor = ['#9aa5b4', '#4aa8ff', '#b45cff'];
    let html = '';
    for (let i = 0; i < n; i++) {
      if (!counts[i]) continue;
      const id = CARD_IDS[i]!;
      const rarity = CARD_RARITY[id];
      html += `<div class="wrh-relic" data-i="${i}" style="--rc:${rarityColor[rarity]}"><img src="${asset(`cards/${id}.png`)}" alt="" draggable="false">${counts[i]! > 1 ? `<b>x${counts[i]}</b>` : ''}</div>`;
    }
    this.relicEl.innerHTML = html;
    this.relicEl.classList.toggle('on', html !== '');
    this.root.classList.toggle('has-relics', html !== '');
    void cards;
  }

  private bindRelicTips(): void {
    this.relicEl.className = 'wrh-relics';
    this.tipEl.className = 'wrh-tip';
    const place = (e: MouseEvent): void => {
      const w = this.tipEl.offsetWidth;
      const h = this.tipEl.offsetHeight;
      this.tipEl.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, e.clientX + 16))}px`;
      this.tipEl.style.top = `${Math.max(6, Math.min(innerHeight - h - 6, e.clientY - h - 14))}px`;
    };
    // the squad cards: class, level, kills, damage; a chip shows what it is; the gear panel explains itself
    this.hud.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (!el) return;
      if (el.dataset.tip === 'gear') {
        this.squadTip = null;
        const g = el.dataset.g;
        this.hoverTip = () => this.gearTipHtml(g!);
        this.tipEl.style.setProperty('--rc', '#9aa5b4');
        this.tipEl.innerHTML = this.hoverTip();
        this.tipEl.style.display = 'block';
        place(e);
        return;
      }
      if (!this.hud.querySelector('#h-squad')?.contains(el)) return;
      this.hoverTip = null;
      this.squadTip = el.dataset.tip === 'chip' ? { kind: 'chip', slot: Number(el.dataset.s), k: Number(el.dataset.k) } : { kind: 'pc', slot: Number(el.dataset.s), k: 0 };
      if (this.lastWorld) this.tipEl.innerHTML = this.squadTipHtml(this.lastWorld);
      this.tipEl.style.display = 'block';
      place(e);
    });
    this.hud.addEventListener('mousemove', (e) => {
      if ((this.squadTip || this.hoverTip) && this.tipEl.style.display === 'block') place(e);
    });
    this.hud.addEventListener('mouseout', (e) => {
      const to = e.relatedTarget as HTMLElement | null;
      if ((this.squadTip || this.hoverTip) && !(to?.closest?.('[data-tip]') && this.hud.contains(to))) {
        this.squadTip = null;
        this.hoverTip = null;
        this.tipEl.style.display = 'none';
      }
    });
    // the drone card: a click opens the list of drones, a click on one of them switches (and never fires a shot behind it)
    this.hud.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('.wrh-drone [data-dt]');
      const card = target.closest<HTMLElement>('.wrh-drone .dr-card');
      if (!row && !card) return;
      e.preventDefault();
      e.stopPropagation();
      if (row) {
        this.h.onDrone?.(Number(row.dataset.dt));
        this.droneOpen = false;
      } else this.droneOpen = !this.droneOpen;
      this.hudHtml.delete('h-drone');
    });
    // the weapon list: a click picks the weapon, and never fires a shot behind it
    this.hud.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.wrh-inv [data-w]');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      this.h.onSlot(Number(row.dataset.w));
    });
    // the round buttons at the top right say what they are in one word
    this.toolbar.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.wrh-tbtn');
      if (!b) return;
      const hint = (this.t.tbHint as Record<string, string>)[b.id.slice(3)] ?? '';
      this.squadTip = null;
      this.hoverTip = null;
      this.tipEl.style.setProperty('--rc', '#9aa5b4');
      this.tipEl.innerHTML = `<b>${esc(hint)}</b>`;
      this.tipEl.style.display = 'block';
      const r = b.getBoundingClientRect();
      this.tipEl.style.left = `${Math.max(6, Math.min(innerWidth - this.tipEl.offsetWidth - 6, r.right - this.tipEl.offsetWidth))}px`;
      this.tipEl.style.top = `${r.bottom + 8}px`;
    });
    this.toolbar.addEventListener('mouseout', (e) => {
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.wrh-tbtn')) this.tipEl.style.display = 'none';
    });
    // a locked weapon of the menu says what opens it
    const lockedAt = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest<HTMLElement>('.wrh-wp.locked[data-lock]');
    this.screen.addEventListener('mouseover', (e) => {
      const el = lockedAt(e);
      if (!el) return;
      const text = this.t.lockedFloor.replace('{n}', el.dataset.lock ?? '').replace('{m}', String(loadProfile().bestWave));
      this.squadTip = null;
      this.hoverTip = null;
      this.tipEl.style.setProperty('--rc', '#9aa5b4');
      this.tipEl.innerHTML = `<b>${esc(text)}</b>`;
      this.tipEl.style.display = 'block';
      const r = el.getBoundingClientRect();
      this.tipEl.style.left = `${Math.max(6, Math.min(innerWidth - this.tipEl.offsetWidth - 6, r.left + r.width / 2 - this.tipEl.offsetWidth / 2))}px`;
      this.tipEl.style.top = `${Math.max(6, r.top - this.tipEl.offsetHeight - 8)}px`;
    });
    this.screen.addEventListener('mouseout', (e) => {
      if (lockedAt(e) && !lockedAt({ target: e.relatedTarget } as unknown as Event)) this.tipEl.style.display = 'none';
    });
    this.relicEl.addEventListener('mouseover', (e) => {
      this.squadTip = null;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.wrh-relic');
      if (!el) return;
      const i = Number(el.dataset.i);
      const id = CARD_IDS[i]!;
      const t = this.t;
      const info = (t.cards as Record<string, readonly [string, string]>)[id] ?? [id, ''];
      const count = this.lastRelicsCounts(i);
      this.tipEl.style.setProperty('--rc', ['#9aa5b4', '#4aa8ff', '#b45cff'][CARD_RARITY[id]]!);
      this.tipEl.innerHTML = `<b>${esc(info[0])}${count > 1 ? ` x${count}` : ''}</b><span>${esc(info[1])}</span><em>${(t.rarity as readonly string[])[CARD_RARITY[id]]}${TEAM_CARDS.includes(id) ? ` &middot; ${t.teamTag}` : ''}</em>`;
      this.tipEl.style.display = 'block';
      place(e);
    });
    this.relicEl.addEventListener('mousemove', (e) => {
      if (this.tipEl.style.display === 'block') place(e);
    });
    this.relicEl.addEventListener('mouseout', (e) => {
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.wrh-relic')) this.tipEl.style.display = 'none';
    });
  }

  private gearTipHtml(g: string): string {
    const t = this.t;
    if (g === 'gren') return `<b>${esc(t.gearGren[0])}</b><span>${esc(t.gearGren[1])}</span>`;
    if (g === 'dash') return `<b>${esc(t.gearDash[0])}</b><span>${esc(t.gearDash[1])}</span>`;
    const tipTxt = (t.classTips as readonly string[])[this.gearInfo.cls] ?? '';
    return `<b>${esc(this.gearInfo.abName)}</b><span>${esc(tipTxt)}</span><em>${esc(t.gearAbility)}</em>`;
  }

  private lastRelicsCounts(i: number): number {
    return Number(this.lastRelics.split(',')[i] ?? 0) || 0;
  }

  private readonly infoEl = document.createElement('div');
  private infoQueue: { title: string; detail: string; who: string; color: string }[] = [];
  private infoBusy = false;

  /**
   * The info bar top left for upgrades that touch the whole squad: slides in, stays a few seconds, slides out. Anything
   * that arrives while one is showing waits in a queue and plays after the previous one has left.
   */
  pushInfo(title: string, detail: string, who: string, color: string): void {
    this.infoQueue.push({ title, detail, who, color });
    if (!this.infoBusy) this.nextInfo();
  }

  private nextInfo(): void {
    const item = this.infoQueue.shift();
    if (!item) {
      this.infoBusy = false;
      return;
    }
    this.infoBusy = true;
    const el = document.createElement('div');
    el.className = 'it';
    el.style.setProperty('--c', item.color);
    el.innerHTML = `<div class="ic">${icon('hud_star', 24)}</div><div><b>${esc(item.title)}</b><span>${esc(item.detail)}</span><small>${this.t.infoBy}: ${esc(item.who)}</small></div>`;
    this.infoEl.appendChild(el);
    void el.offsetWidth;
    el.classList.add('in');
    setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        this.nextInfo();
      }, 340);
    }, 3600);
  }

  /** The two round buttons that are always there, top right: language and settings. */
  private buildToolbar(): void {
    this.toolbar.className = 'wrh-tb';
    this.toolbar.innerHTML = `<button type="button" class="wrh-tbtn" id="tb-lang">${icon('tb_lang', 26)}<small></small></button><button type="button" class="wrh-tbtn" id="tb-set">${icon('tb_set', 26)}</button><div class="wrh-langpop" id="tb-pop"></div>`;
    this.langPop = this.toolbar.querySelector<HTMLElement>('#tb-pop');
    this.toolbar.querySelector<HTMLElement>('#tb-lang')!.onclick = (e) => {
      e.stopPropagation();
      this.langPop!.classList.toggle('open');
    };
    this.toolbar.querySelector<HTMLElement>('#tb-set')!.onclick = () => this.toggleSettings();
    document.addEventListener('click', () => this.langPop?.classList.remove('open'));
    this.refreshToolbar();
  }

  /** Titles and the language list follow the chosen language. */
  private refreshToolbar(): void {
    const t = this.t;
    const set = (id: string, text: string): void => {
      const b = this.toolbar.querySelector<HTMLElement>(id);
      if (b) {
        b.setAttribute('aria-label', text);
      }
    };
    set('#tb-lang', t.tbLang);
    set('#tb-set', t.tbSettings);
    const code = this.toolbar.querySelector('#tb-lang small');
    if (code) code.textContent = this.lang.toUpperCase();
    if (this.langPop) {
      this.langPop.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l.id}" class="${l.id === this.lang ? 'on' : ''}">${l.label}</button>`).join('');
      this.langPop.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => {
        b.onclick = () => {
          this.langPop!.classList.remove('open');
          this.h.onSetting('lang', b.getAttribute('data-lang')!);
        };
      });
    }
  }

  /** Remember how to draw the screen that is up, so a language change can draw it again with the typed text kept. */
  private redraw: (() => void) | null = null;

  private redrawScreen(): void {
    if (!this.redraw) return;
    const typed = new Map<string, string>();
    this.screen.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      if (i.id) typed.set(i.id, i.value);
    });
    const scroll = this.screen.querySelector<HTMLElement>('.wrh-scroll')?.scrollTop ?? 0;
    this.keepMenuPage = true;
    try {
      this.redraw();
    } finally {
      this.keepMenuPage = false;
    }
    typed.forEach((v, id) => {
      const i = this.screen.querySelector<HTMLInputElement>('#' + id);
      if (i && !i.value) i.value = v;
    });
    const sc = this.screen.querySelector<HTMLElement>('.wrh-scroll');
    if (sc) sc.scrollTop = scroll;
  }

  /** Translate a UI string key (for messages the game shows outside the UI module). */
  tr(key: 'noServer' | 'noConnect' | 'connLost' | 'rejoinGone' | 'rejoinSeat' | 'desync' | 'reconnecting' | 'syncing' | 'joining'): string {
    return (this.t as unknown as Record<string, string>)[key]!;
  }

  private get t(): (typeof UI_STRINGS)['en'] {
    return UI_STRINGS[this.lang] as (typeof UI_STRINGS)['en'];
  }

  setDev(html: string): void {
    this.dev.innerHTML = html;
  }

  clearScreen(): void {
    this.redraw = null;
    this.lobbyCode = '';
    this.disposePreview();
    delete document.documentElement.dataset.menu;
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

  /** Tabs, the turntable, the arrows for the accessory or weapon and the name of what is shown. */
  private previewStage(): string {
    const t = this.t;
    return `<div class="wrh-tabs"><button type="button" class="wrh-wp${this.previewMode === 'char' ? ' on' : ''}" data-ptab="char">${t.tabChar}</button><button type="button" class="wrh-wp${this.previewMode === 'weapon' ? ' on' : ''}" data-ptab="weapon">${t.tabWeapon}</button></div>
      <div class="wrh-stage"><button type="button" class="wrh-arrow" data-pdir="-1" aria-label="previous">${icon('hud_left', 32)}</button><div class="wrh-canvas" id="wrh-prev-host"></div><button type="button" class="wrh-arrow" data-pdir="1" aria-label="next">${icon('hud_right', 32)}</button></div>
      <div class="wrh-prev-name" id="wrh-prev-name"></div><div class="wrh-prev-stats" id="wrh-prev-stats"></div>`;
  }

  private previewSwatches(): string {
    const swatches = PLAYER_COLORS.map((c, i) => `<button type="button" class="wrh-sw${i === this.color ? ' on' : ''}" data-sw="${i}" style="background:${c}" aria-label="${c}"></button>`).join('');
    return `<div class="wrh-swatches" id="wrh-swatches">${swatches}</div>`;
  }

  private classPicker(): string {
    const t = this.t;
    const tips = t.classTips as readonly string[];
    return `<label style="margin-top:8px">${t.classTitle}</label>
      <div class="wrh-classes">${(t.classNames as readonly string[]).map((n, i) => `<button type="button" class="wrh-class${i === this.cls ? ' on' : ''}" data-cls="${i}" title="${esc(tips[i]!)}"><span class="ci">${CLASS_ICON(i)}</span><b>${n}</b></button>`).join('')}</div>
      <div class="wrh-class-tip" id="wrh-class-tip">${esc(tips[this.cls]!)}</div>`;
  }

  /** Markup of the whole 3D preview block (the online room): turntable, colours and class. */
  private previewBlock(): string {
    return `<div class="wrh-prev">${this.previewStage()}${this.previewSwatches()}${this.classPicker()}</div>`;
  }

  /** Wire the preview block: arrows change the accessory (Character tab) or the weapon (Weapon tab), swatches the colour. */
  private bindPreview(): void {
    this.disposePreview();
    const host = this.screen.querySelector<HTMLElement>('#wrh-prev-host');
    if (!host) return;
    try {
      // the menu's stage is big; its page may be hidden right now, so the size comes from the window, not from the layout
      const lobby = host.closest('.wrh-lobby') !== null;
      const big = host.closest('.wrh-home') !== null;
      const size = big ? Math.max(170, Math.min(lobby ? 320 : 440, Math.round(Math.min(window.innerHeight * (lobby ? 0.32 : 0.4), window.innerWidth - 190)))) : 230;
      this.preview = new Preview(size);
      host.appendChild(this.preview.canvas);
    } catch {
      this.preview = null; // no WebGL for a second context: the menu still works without the picture
    }
    const names = this.t.accs as readonly string[];
    const weaponNames = this.t.weapons as Record<string, string>;
    const unlocked = (): WeaponId[] => WEAPON_IDS.filter((w) => !BALANCE.weapons[w].melee && isUnlocked(w, loadProfile()));
    const refresh = (): void => {
      const colorHex = PLAYER_COLORS[this.color >= 0 ? this.color % PLAYER_COLORS.length : 0]!;
      const q = (id: string): HTMLElement => this.screen.querySelector<HTMLElement>('#' + id)!;
      q('wrh-prev-name').textContent = this.previewMode === 'char' ? (names[this.acc] ?? '') : (weaponNames[this.weapon] ?? '');
      q('wrh-prev-stats').innerHTML = this.previewMode === 'weapon' ? weaponStatBars(this.t, this.weapon) : '';
      this.screen.querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) => el.classList.toggle('on', el.dataset.ptab === this.previewMode));
      this.screen.querySelectorAll<HTMLElement>('[data-sw]').forEach((el) => el.classList.toggle('on', Number(el.dataset.sw) === this.color));
      this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => el.classList.toggle('on', el.dataset.w === this.weapon));
      void this.preview?.set({ mode: this.previewMode, accessory: ACCESSORIES[this.acc % ACCESSORIES.length]!, color: colorHex, weapon: this.weapon });
      this.refreshHub();
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
        this.dimWeapons();
        this.refreshHub();
      };
    });
    this.dimWeapons();
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
        if (el.classList.contains('locked')) return;
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
    p.mods = this.mods;
    saveProfile(p);
  }

  /** Option rows shared by the menu and the lobby: arena and difficulty (host or solo) and the player's look. */
  /** Arena pictures and the skull difficulty row (read-only text for guests in a lobby). */
  private arenaRows(editable: boolean, map: number, mods: number): string {
    const t = this.t;
    const names = t.maps as Record<string, string>;
    if (!editable) {
      const pic = map >= 0 ? `<img class="wrh-thumb-s" src="${arenaThumb(map)}" alt="">` : '<span class="wrh-thumb-s wrh-dice">?</span>';
      return `<div class="wrh-ro">${pic}<span><b>${names[String(map)]}</b></span></div><label>${t.difficulty}</label><div id="wrh-modsrow">${modsRow(this.lang, mods, false)}</div>`;
    }
    const cards = ['-1', ...MAPS.map((_, i) => String(i))]
      .map((id) => {
        const pic = id === '-1' ? '<span class="wrh-dice">?</span>' : `<img src="${arenaThumb(Number(id))}" alt="">`;
        return `<button type="button" class="wrh-arena${id === String(map) ? ' on' : ''}" data-map="${id}">${pic}<span>${names[id]}</span></button>`;
      })
      .join('');
    return `<label>${t.arena}</label><div class="wrh-arenas">${cards}</div><label>${t.difficulty}</label><div id="wrh-modsrow">${modsRow(this.lang, mods, true)}</div>`;
  }

  /** The page of the main menu that is showing ('hub' is the card hub). */
  private menuPage = 'hub';
  private escBound = false;
  private keepMenuPage = false;

  private home(): HTMLElement | null {
    return this.screen.querySelector<HTMLElement>('.wrh-home[data-page]');
  }

  /** Open a page of the main menu: the 3D stage moves to the page that wants it and the keyboard focus to its Back button. */
  private goPage(page: string, focus = true): void {
    const home = this.home();
    if (!home) return;
    this.menuPage = page;
    home.dataset.page = page;
    const stage = this.screen.querySelector<HTMLElement>('#wrh-stagebox');
    const slot = this.screen.querySelector<HTMLElement>(`.wrh-slot[data-slot="${page}"]`);
    if (stage && slot) slot.appendChild(stage);
    home.scrollTop = 0;
    if (focus) {
      const target = page === 'hub' ? home.querySelector<HTMLElement>('#wrh-card-play') : home.querySelector<HTMLElement>(`[data-p="${page}"] .wrh-back`);
      target?.focus({ preventScroll: true });
    }
  }

  /** Escape: close what is on top (settings, the online dialog), else go back one level. */
  private onEscape(e: KeyboardEvent): void {
    if (e.code !== 'Escape' || e.defaultPrevented || document.documentElement.dataset.menu !== '1') return;
    if (document.querySelector('.wrh-ach, .wrh-modal')) return; // those close themselves
    if (this.settingsOpen) {
      this.toggleSettings();
      return;
    }
    const online = this.screen.querySelector<HTMLElement>('#wrh-online-panel');
    if (online?.classList.contains('open')) {
      online.classList.remove('open');
      return;
    }
    if (this.menuPage !== 'hub' && this.menuPage !== 'lobby') this.goPage('hub');
  }

  /** The cards of the hub follow the weapon, class and difficulty chosen on the other pages. */
  private refreshHub(): void {
    if (!this.home()) return;
    const set = (id: string, text: string): void => {
      const e = this.screen.querySelector<HTMLElement>('#' + id);
      if (e) e.textContent = text;
    };
    const w = (this.t.weapons as Record<string, string>)[this.weapon] ?? '';
    const c = (this.t.classNames as readonly string[])[this.cls] ?? '';
    const line = MELEE_CLASSES.includes(this.cls) ? c : `${w} · ${c}`;
    set('wrh-hc-loadout', line);
    set('wrh-loadline', line);
    const wi = this.screen.querySelector<HTMLElement>('#wrh-hc-wicon');
    if (wi) wi.innerHTML = this.weaponCardIcon();
    set('wrh-hc-mods', modsSummary(this.lang, this.mods));
    const mi = this.screen.querySelector<HTMLElement>('#wrh-hc-micon');
    if (mi) mi.innerHTML = modsCardIcon(this.mods);
  }

  private weaponCardIcon(): string {
    return `<img src="${asset(`ui/wpn_${this.weapon}.png`)}" alt="" draggable="false">`;
  }

  /** The Difficulty page: the same multiplier grid the room uses, drawn in the page. */
  private drawModsPage(): void {
    const host = this.screen.querySelector<HTMLElement>('#wrh-mods-page');
    if (!host) return;
    const scroll = host.scrollTop;
    host.innerHTML = modsPanel(this.lang, this.mods, true, true);
    host.querySelectorAll<HTMLElement>('.wrh-mod').forEach((b) => {
      b.onclick = () => this.setMods(Difficulty.toggle(this.mods, Number(b.dataset.mod)));
    });
    const all = host.querySelector<HTMLElement>('#wrh-mods-all');
    if (all) all.onclick = () => this.setMods(Difficulty.ALL);
    const none = host.querySelector<HTMLElement>('#wrh-mods-none');
    if (none) none.onclick = () => this.setMods(0);
    host.scrollTop = scroll;
  }

  private setMods(v: number): void {
    this.mods = v;
    this.persistLook();
    this.drawModsPage();
    this.refreshHub();
    const row = this.screen.querySelector<HTMLElement>('#wrh-modsrow');
    if (row) {
      row.innerHTML = modsRow(this.lang, this.mods, true);
      this.bindMenuMods();
    }
  }

  /** In the main menu the difficulty summary on the Play page opens the Difficulty page. */
  private bindMenuMods(): void {
    const open = this.screen.querySelector<HTMLElement>('#wrh-mods-open');
    if (open) open.onclick = () => this.goPage('mods');
  }

  showMenu(error = ''): void {
    this.redraw = () => this.showMenu(error);
    document.documentElement.dataset.menu = '1';
    if (!this.escBound) {
      this.escBound = true;
      window.addEventListener('keydown', (e) => this.onEscape(e));
    }
    this.lobbyCode = '';
    const t = this.t;
    const profile = loadProfile();
    this.acc = profile.acc;
    this.color = profile.color;
    this.cls = profile.cls;
    this.map = profile.map;
    this.mods = profile.mods;
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
    const saved0 = loadRejoin();
    // a saved game of another major.minor cannot be rejoined (the relay turns it away): do not offer it
    const rejoin = saved0 && (saved0.v === undefined || compatibleVersions(saved0.v, GAME_VERSION)) ? saved0 : null;
    const ach = achWords(this.lang);
    const got = ACHIEVEMENTS.filter((a) => isGot(a, profile.ach)).length;
    this.screen.innerHTML = menuMarkup({
      title: t.title,
      tag: t.tag,
      bestLabel: t.best,
      bestWave: profile.bestWave,
      bestKills: profile.bestKills,
      invite: inviteCode ? `<p class="wrh-invite">${icon('hud_party', 22)} ${t.invited} <b>${esc(inviteCode)}</b>. ${t.invitedHint}</p>` : '',
      nameLabel: t.name,
      savedName: saved,
      weaponLabel: t.weapon,
      weaponsHtml: this.weaponButtons(),
      stageHtml: `<div class="wrh-prev">${this.previewStage()}</div>`,
      lookHtml: this.previewSwatches(),
      classHtml: this.classPicker(),
      arenaHtml: this.arenaRows(true, this.map, this.mods),
      modsHtml: modsPanel(this.lang, this.mods, true, true),
      soloLabel: t.solo,
      hostLabel: t.host,
      joinLabel: t.join,
      onlineLabel: t.online,
      settingsLabel: t.settings,
      achLabel: ach.title,
      achUnread: unreadCount(profile.ach),
      achSub: `${got} / ${ACHIEVEMENTS.length} ${ach.earned}`,
      closeLabel: t.close,
      rejoinHtml: rejoin ? `<button type="button" id="wrh-rejoin" class="wrh-hc wrh-hc-rejoin"><span class="ico">${icon('hud_link', 34)}</span><span class="txt"><b>${t.rejoin} (${esc(rejoin.code)})</b></span></button>` : '',
      codeLabel: t.code,
      inviteCode,
      passLabel: t.password,
      serverLabel: t.server,
      defServer,
      error,
      words: {
        back: t.back,
        play: t.play,
        playSub: t.playSub,
        loadout: t.hubLoadout,
        loadoutSub: '',
        loadoutIcon: this.weaponCardIcon(),
        difficulty: t.difficulty,
        modsSub: modsSummary(this.lang, this.mods),
        modsIcon: modsCardIcon(this.mods),
        settingsSub: t.hubSettingsSub,
        change: t.change,
        achIcon: asset('ui/ach_menu.webp'),
      },
    });
    this.bindWeapons();
    this.bindPreview();
    this.refreshHub();
    void this.fillRelay(fromParam !== null);
    this.bindGroup('map', (id) => {
      this.map = Number(id);
      this.persistLook();
    });
    this.drawModsPage();
    this.bindMenuMods();
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
    const online = q('wrh-online-panel');
    const openOnline = (on: boolean): void => {
      online.classList.toggle('open', on);
      if (on) q('wrh-host').focus({ preventScroll: true });
    };
    q('wrh-online').onclick = () => openOnline(true);
    q('wrh-online-x').onclick = () => openOnline(false);
    online.onclick = (e) => {
      if (e.target === online) openOnline(false);
    };
    this.screen.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
      el.addEventListener('click', () => this.goPage(el.dataset.go!));
    });
    q('wrh-open-settings').onclick = () => this.toggleSettings();
    q('wrh-open-ach').onclick = () => this.showAchievements();
    // a language change redraws the menu: stay on the page the player was on
    if (this.keepMenuPage && this.menuPage !== 'hub') this.goPage(this.menuPage, false);
    else this.menuPage = 'hub';
    if (inviteCode) {
      // an invite link: the Play page opens with the online dialog and the code filled in, and Join is the main button
      this.goPage('play', false);
      openOnline(true);
      q('wrh-join').classList.remove('alt');
      q('wrh-host').classList.add('alt');
      q('wrh-code').onkeydown = (e) => {
        if ((e as KeyboardEvent).key === 'Enter') q('wrh-join').click();
      };
      q('wrh-name').onkeydown = (e) => {
        if ((e as KeyboardEvent).key === 'Enter') q('wrh-join').click();
      };
    }
    const rj = this.screen.querySelector<HTMLElement>('#wrh-rejoin');
    if (rj) rj.onclick = () => this.h.onRejoin();
    // a new version: its release notes open by themselves (once)
    autoOpenReleaseNotes();
  }

  /** Pause screen (solo only; online games keep running). */
  showPause(): void {
    this.redraw = () => this.showPause();
    this.lobbyCode = '';
    const t = this.t;
    delete document.documentElement.dataset.menu;
    this.screen.innerHTML = `<div class="wrh-panel wrh-center" style="text-align:center"><h1>${t.paused}</h1>
      <button id="wrh-resume">${t.resume}</button><button id="wrh-pset" class="alt">${t.settings}</button><button id="wrh-leave" class="warn">${t.leave}</button></div>`;
    this.screen.querySelector<HTMLElement>('#wrh-resume')!.onclick = () => this.h.onResume();
    this.screen.querySelector<HTMLElement>('#wrh-pset')!.onclick = () => this.toggleSettings();
    this.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.h.onLeave();
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

  private weaponButtons(): string {
    const names = this.t.weapons as Record<string, string>;
    const profile = loadProfile();
    return WEAPON_IDS.filter((w) => !BALANCE.weapons[w].melee).map((w) => {
      const ok = isUnlocked(w, profile);
      return `<button type="button" class="wrh-wp${w === this.weapon ? ' on' : ''}${ok ? '' : ' locked'}" data-w="${w}"${ok ? '' : ` aria-disabled="true" data-lock="${WEAPON_UNLOCK[w]}"`}>${ok ? '' : icon('hud_lock', 16) + ' '}<img class="wp-i" src="${asset(`ui/wpn_${w}.png`)}" alt="" draggable="false">${names[w]}</button>`;
    }).join('');
  }

  /** Blade and hammer classes fight with their own weapon: the list of guns is greyed out for them. */
  private dimWeapons(): void {
    const melee = MELEE_CLASSES.includes(this.cls);
    this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((x) => x.classList.toggle('dim', melee));
  }

  private bindWeapons(): void {
    this.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => {
      el.onclick = () => {
        if (el.classList.contains('locked')) return; // locked guns only explain themselves (hover tip)
        this.weapon = el.dataset.w as WeaponId;
        this.screen.querySelectorAll('.wrh-wp[data-w]').forEach((x) => x.classList.toggle('on', x === el));
        this.h.onWeapon(this.weapon);
      };
    });
  }

  /** The weapon list above the minimap: icon, name and magazine of every owned weapon (a click picks it), the one in the hands outlined in yellow. */
  /** Drone UI: the card of the active drone (icon, name, level, experience) and, opened by a click, the list of the drones owned. */
  private droneOpen = false;
  private droneLevels = new Map<number, number>();
  private droneFlashAt = -1e9;

  private droneHtml(world: World, slot: number, now: number): string {
    const T = DRONE_TYPES.length;
    const owned: number[] = [];
    for (let k = 0; k < T; k++) if (world.pDLv[slot * T + k]! > 0) owned.push(k);
    if (!owned.length || !world.pActive[slot]) {
      this.droneOpen = false;
      return '';
    }
    const t = this.t;
    const names = t.droneNames as readonly string[];
    const act = world.pDrone[slot]! - 1;
    for (const k of owned) {
      const lv = world.pDLv[slot * T + k]!;
      if (k === act && (this.droneLevels.get(k) ?? lv) < lv) this.droneFlashAt = now;
      this.droneLevels.set(k, lv);
    }
    const bar = (k: number): string => {
      const lv = world.pDLv[slot * T + k]!;
      const frac = lv >= DRONE_MAX_LEVEL ? 1 : world.pDXp[slot * T + k]! / droneNeed(lv);
      return `<i class="bar"><s style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></s></i>`;
    };
    const warm = world.pDWarm[slot]!;
    const down = world.pState[slot] !== PlayerState.Alive;
    let html = '';
    if (act >= 0) {
      const lv = world.pDLv[slot * T + act]!;
      const tier = Math.min(6, Math.floor(lv / DRONE_TIER_LEVELS));
      html += `<div class="dr-card${this.droneOpen ? ' open' : ''}${now - this.droneFlashAt < 1400 ? ' up' : ''}${warm > 0 || down ? ' warm' : ''}" title="${esc(names[act] + ': ' + (t.droneTips as readonly string[])[act])}">` +
        `<span class="dr-ic">${icon('drone_' + act, 40)}${warm > 0 && !down ? `<em>${Math.ceil(warm)}</em>` : ''}</span>` +
        `<span class="dr-main"><b>${esc(names[act]!)}</b><small>${t.droneLv} ${lv}${lv >= DRONE_MAX_LEVEL ? ' MAX' : ''} &middot; ${'&#9679;'.repeat(tier)}${'&#9675;'.repeat(6 - tier)}</small>${bar(act)}</span>` +
        `${owned.length > 1 ? `<span class="dr-sw">${this.droneOpen ? '&#9660;' : '&#9650;'}</span>` : ''}</div>`;
    }
    if (this.droneOpen) {
      html += `<div class="dr-list"><p>${t.droneInv}</p>` + owned
        .map((k) => `<div class="dr-row${k === act ? ' cur' : ''}" data-dt="${k}" title="${esc((t.droneTips as readonly string[])[k]!)}">${icon('drone_' + k, 30)}<span><b>${esc(names[k]!)}</b><small>${t.droneLv} ${world.pDLv[slot * T + k]}${k === act ? ' &middot; ' + t.droneActive : ''}</small>${bar(k)}</span></div>`)
        .join('') + '</div>';
    }
    return html;
  }

  private lvlImgBound = false;
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
    this.redraw = () => this.showConnecting();
    this.lobbyCode = '';
    delete document.documentElement.dataset.menu;
    this.screen.innerHTML = `<div class="wrh-panel wrh-center"><h1>${this.t.connecting}</h1></div>`;
  }

  /** What the lobby on screen was built for: while it stays the same, updates only touch the list and the arena rows. */
  private lobbyCode = '';
  private lobbyHost = false;
  private lobbyLocked = false;
  private lobbyOpts = '';
  private lobbyMap = 0;
  private lobbyMods = 0;

  private lobbyList(players: { slot: number; name: string; host: boolean; weapon: WeaponId; acc: number; color: number }[]): string {
    const t = this.t;
    const accNames = t.accs as readonly string[];
    return players
      .map(
        (p) =>
          `<li><span class="wrh-dot" style="background:${p.color >= 0 ? PLAYER_COLORS[p.color % PLAYER_COLORS.length] : PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"></span>${esc(p.name)} ${p.host ? `<small>(${t.host_tag})</small>` : ''} <small style="opacity:.7">&middot; ${(t.weapons as Record<string, string>)[p.weapon]} &middot; ${accNames[p.acc] ?? ''}</small></li>`,
      )
      .join('');
  }

  private bindArena(): void {
    this.bindGroup('map', (id) => {
      this.lobbyMap = Number(id);
      this.h.onOptions(this.lobbyMap, this.lobbyMods);
    });
    this.bindMods(true, () => this.lobbyMods, (v) => {
      this.lobbyMods = v;
      this.h.onOptions(this.lobbyMap, this.lobbyMods);
    });
  }

  /** The multipliers button opens the full-screen grid; the host (or a solo player) toggles, guests only read. */
  private bindMods(editable: boolean, get: () => number, set: (v: number) => void): void {
    const open = this.screen.querySelector<HTMLElement>('#wrh-mods-open');
    if (!open) return;
    open.onclick = () => this.openMods(editable, get, set);
  }

  private openMods(editable: boolean, get: () => number, set: (v: number) => void): void {
    const modal = document.createElement('div');
    modal.className = 'wrh-modal';
    const draw = (): void => {
      modal.innerHTML = modsPanel(this.lang, get(), editable);
      modal.querySelectorAll<HTMLElement>('.wrh-mod').forEach((b) => {
        b.onclick = () => {
          if (!editable) return;
          set(get() ^ (1 << Number(b.dataset.mod)));
          draw();
        };
      });
      const all = modal.querySelector<HTMLElement>('#wrh-mods-all');
      if (all) all.onclick = () => (set(Difficulty.ALL), draw());
      const none = modal.querySelector<HTMLElement>('#wrh-mods-none');
      if (none) none.onclick = () => (set(0), draw());
      modal.querySelector<HTMLElement>('#wrh-mods-close')!.onclick = close;
    };
    const close = (): void => {
      modal.remove();
      const row = this.screen.querySelector<HTMLElement>('#wrh-modsrow');
      if (row) {
        row.innerHTML = modsRow(this.lang, get(), editable);
        this.bindMods(editable, get, set);
      }
    };
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };
    draw();
    document.body.appendChild(modal);
  }

  showLobby(
    code: string,
    players: { slot: number; name: string; host: boolean; connected: boolean; weapon: WeaponId; acc: number; color: number }[],
    iAmHost: boolean,
    options: { map: number; mods: number } = { map: 0, mods: 0 },
    locked = false,
  ): void {
    this.redraw = () => {
      this.lobbyCode = '';
      this.showLobby(code, players, iAmHost, options, locked);
    };
    const t = this.t;
    // somebody else changed something (joined, picked a weapon, the host chose an arena): update in place. Rebuilding the
    // whole lobby would reset the scroll position, the 3D preview and whatever the player is clicking.
    if (this.lobbyCode === code && this.lobbyHost === iAmHost && this.lobbyLocked === locked && this.screen.querySelector('#wrh-lobby')) {
      this.screen.querySelector<HTMLElement>('#wrh-plist')!.innerHTML = this.lobbyList(players);
      this.screen.querySelector<HTMLElement>('#wrh-pcount')!.textContent = `${t.players} (${players.length}/${MAX_PLAYERS})`;
      const key = `${options.map}/${options.mods}`;
      if (key !== this.lobbyOpts) {
        this.lobbyOpts = key;
        this.lobbyMap = options.map;
        this.lobbyMods = options.mods;
        this.screen.querySelector<HTMLElement>('#wrh-arena-wrap')!.innerHTML = this.arenaRows(iAmHost, options.map, options.mods);
        if (iAmHost) this.bindArena();
        else this.bindMods(false, () => this.lobbyMods, () => undefined);
      }
      return;
    }
    this.lobbyCode = code;
    this.lobbyHost = iAmHost;
    this.lobbyLocked = locked;
    this.lobbyOpts = `${options.map}/${options.mods}`;
    this.lobbyMap = options.map;
    this.lobbyMods = options.mods;
    document.documentElement.dataset.menu = '1'; // the room is a full-screen page of the menu too
    this.menuPage = 'lobby';
    this.screen.innerHTML = lobbyMarkup({
      back: t.back,
      codeLabel: t.code,
      code,
      locked: locked ? ' ' + icon('hud_lock', 24) : '',
      waiting: iAmHost ? '' : t.waiting,
      playersLabel: `${t.players} (${players.length}/${MAX_PLAYERS})`,
      playersHtml: this.lobbyList(players),
      weaponLabel: t.weapon,
      weaponsHtml: this.weaponButtons(),
      previewHtml: this.previewBlock(),
      arenaHtml: this.arenaRows(iAmHost, options.map, options.mods),
      startHtml: iAmHost ? `<button id="wrh-start">${t.start}</button>` : '',
      inviteHtml: `<button id="wrh-invite" class="alt">${icon('hud_link', 18)} ${t.invite}</button>`,
      leaveLabel: t.leave,
    });
    this.bindWeapons();
    this.bindPreview();
    if (iAmHost) this.bindArena();
    else this.bindMods(false, () => this.lobbyMods, () => undefined);
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

  private goStop: (() => void) | null = null;

  /** The game-over page: the run in numbers, revealed one card at a time (a click shows them all). */
  /** The full-screen achievements page. Opening it counts as having seen everything earned so far (the red badge goes away). */
  showAchievements(): void {
    const page = document.createElement('div');
    page.className = 'wrh-ach';
    page.innerHTML = achPage(this.lang, loadProfile().ach);
    markSeen();
    this.screen.querySelector('#wrh-ach-badge')?.remove();
    const close = (): void => {
      page.remove();
      window.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    page.querySelector<HTMLElement>('#wrh-ach-close')!.onclick = close;
    document.body.appendChild(page);
  }

  showGameOver(world: World, rec?: { newWave: boolean; newKills: boolean; unlocked: WeaponId[]; ach?: readonly AchievementDef[] }, extras: RunExtras = { clicks: 0, keys: 0, bestCombo: 0 }, instant = false, slot = 0): void {
    this.redraw = () => this.showGameOver(world, rec, extras, true, slot);
    this.lobbyCode = '';
    this.goStop?.();
    const t = this.t;
    const names = t.weapons as Record<string, string>;
    const extra = rec
      ? `${rec.newWave || rec.newKills ? `<p style="color:#d8862e;font-weight:800">${t.newBest}</p>` : ''}${rec.unlocked.length ? `<p>${icon('hud_unlock', 18)} ${t.unlockedWeapon}: <b>${rec.unlocked.map((w) => names[w]).join(', ')}</b></p>` : ''}`
      : '';
    const head = `<h1>${t.over}</h1>
      <p>${t.reached} <b>${world.wave}</b> &middot; ${t.kills} <b>${world.kills}</b> &middot; ${t.level} <b>${Math.max(1, ...Array.from(world.pLevel).filter((_, i) => world.pActive[i]))}</b></p>${extra}${this.squadStats(world)}`;
    const r = renderGameOver({
      world,
      screen: this.screen,
      lang: this.lang,
      slot,
      playerNames: this.playerNames,
      slotColor: this.slotColor,
      weaponName: (id) => names[WEAPON_IDS[id]!] ?? '',
      head,
      foot: `${runAchievementsHtml(this.lang, rec?.ach ?? [])}<button id="wrh-again">${t.again}</button>`,
      tick: (_i, last) => this.h.onUiSound(last ? 'confirm' : 'click'),
      instant,
      extras: { ...extras, slot },
    });
    this.goStop = r.stop;
    const again = (): void => {
      this.screen.querySelector<HTMLElement>('#wrh-again')!.onclick = () => this.h.onAgain();
    };
    again();
    // the page is rebuilt when a player tab is chosen: the button needs its handler again
    new MutationObserver(again).observe(this.screen, { childList: true });
  }

  private buildHud(): void {
    this.hudHtml.clear();
    this.hud.innerHTML = `
      <div class="wrh-hurt" id="h-hurt"></div>
      <div class="wrh-top"><div class="big" id="h-wave"></div><div class="wrh-bar"><i id="h-xp"></i></div><div class="wrh-bar boss" id="h-bossbar" style="display:none"><i id="h-boss"></i></div><div id="h-bosslabel" style="display:none;color:#d8362e"></div></div>
      <div class="wrh-squad" id="h-squad"></div>
      <div class="wrh-inv" id="h-inv"></div>
      <canvas class="wrh-mini" id="h-mini" width="360" height="240"></canvas>
      <div class="wrh-reload" id="h-reload"><i></i></div>
      <div class="wrh-me" id="h-me"></div>
      <div class="wrh-drone" id="h-drone"></div>
      <div class="wrh-banner" id="h-banner" style="display:none"></div>
      <div class="wrh-cards" id="h-cards" style="display:none"></div>
      <div class="wrh-lvl" id="h-lvl" style="display:none"><img src="${asset('ui/levelup.png')}" alt="" draggable="false"><span class="fb">LEVEL UP</span><b></b></div>
      <div class="wrh-warn" id="h-warn" style="display:none"></div>
      <div class="wrh-hint" id="h-hint"></div>
      <div class="wrh-hostpause" id="h-hostpause"></div>`;
    this.hudBuilt = true;
  }

  clearHud(): void {
    this.relicEl.classList.remove('on');
    this.root.classList.remove('has-relics');
    this.lastRelics = '';
    this.tipEl.style.display = 'none';
    this.hud.innerHTML = '';
    this.hudHtml.clear();
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
    if (on) el.innerHTML = `${icon('hud_pause', 18)} ${this.t.hostPaused}${canResume ? `<small>${this.t.hostResume}</small>` : ''}`;
  }

  private readonly cineEl = document.createElement('div');
  private cineLabel = '';

  /** The finisher's look: letterbox bars, a vignette and the name of whoever landed the last blow. `k` is 0 (off) to 1. */
  setCine(k: number, who: string, color: string): void {
    const el = this.cineEl;
    if (!el.isConnected) {
      el.className = 'wrh-cine';
      el.innerHTML = '<i class="top"></i><i class="bot"></i><b></b>';
      this.root.appendChild(el);
    }
    this.root.classList.toggle('cine-on', k > 0.05);
    if (k <= 0.001) {
      if (el.style.display !== 'none') el.style.display = 'none';
      this.cineLabel = '';
      return;
    }
    el.style.display = 'block';
    el.style.setProperty('--k', k.toFixed(3));
    const label = who ? `${this.t.finalBlow}: ${who}` : this.t.finalBlow;
    if (label !== this.cineLabel) {
      this.cineLabel = label;
      const b = el.querySelector('b')!;
      b.textContent = label;
    }
    el.style.setProperty('--who', color);
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
    this.renderSettings();
  }

  private settingsTab = 'graphics';
  private settingsScroll = 0;

  /** True while the settings window is open. */
  get overlayOpen(): boolean {
    return this.settingsOpen;
  }

  private renderSettings(): void {
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
      onReport: () => this.h.onReport?.(),
      needsReload: (key) => this.h.needsReload?.(key) ?? false,
      onReload: () => location.reload(),
      onClose: () => this.toggleSettings(),
    });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.root.classList.toggle('no-minimap', !s.minimap);
    this.root.classList.toggle('no-tags', !s.nameTags);
    this.root.style.setProperty('--wrh-zoom', String([1, 1.18, 1.38][s.textSize] ?? 1));
    const langChanged = this.lang !== s.lang;
    this.lang = s.lang;
    document.documentElement.lang = this.lang;
    if (langChanged) window.dispatchEvent(new Event('wrh-lang')); // the release notes window follows the language
    this.refreshToolbar();
    if (this.settingsOpen) this.renderSettings();
    this.lastCards = '';
    if (langChanged) {
      this.hudBuilt = false;
      this.redrawScreen();
    }
  }

  /** Update the HUD from the world (throttled to ~12 Hz; cheap DOM writes only). */
  update(world: World, slot: number, hurt: number, now: number, names: string[]): void {
    this.lastWorld = world;
    if (!this.hudBuilt) this.buildHud();
    const hurtEl = this.hud.querySelector<HTMLElement>('#h-hurt')!;
    const wv = viewOf(world);
    const pulse = wv.lowHealth(slot) ? 0.22 + 0.18 * Math.sin(now / 180) : 0;
    hurtEl.style.opacity = String(Math.min(1, Math.max(hurt, pulse)));
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.hud.querySelector<HTMLElement>('#h-banner')!.style.display = 'none';
    }
    if (now - this.lastHud < 80) return;
    this.lastHud = now;
    if (this.startNow < 0 || now < this.startNow) this.startNow = now;
    this.lastNow = now;
    const t = this.t;
    const set = (id: string, html: string): void => {
      // compare with what was written last time: the browser re-serialises innerHTML (entities become characters), so
      // reading it back never matches and every frame would rebuild the element (and eat a click on it)
      if (this.hudHtml.get(id) === html) return;
      const el = this.hud.querySelector<HTMLElement>('#' + id)!;
      this.hudHtml.set(id, html);
      el.innerHTML = html;
    };
    const phase = world.misc[MISC.Phase]!;
    const left = wv.enemiesLeft;
    const bossNext = world.wave % BALANCE.progression.boss.everyWaves === 0;
    const sub = phase === FloorPhase.Fight ? `${left} ${t.enemiesLeft}${bossNext ? ` &middot; <span class="wrh-low">${t.boss}!</span>` : ''}` : phase === FloorPhase.Ascend ? t.climbing : phase === FloorPhase.Cleared ? t.breather : t.getReady;
    set('h-wave', `${t.wave} ${world.wave} &middot; ${t.kills} ${world.kills} &middot; ${t.level} ${world.pLevel[slot]}<br><small style="font-weight:600;opacity:.75">${sub}</small>`);
    // the big countdown under the top bar: after a clear (before the climb) and on the new floor (before the fight)
    const secsLeft = Math.max(0, Math.ceil((world.misc[MISC.PhaseEnd]! - world.tick) / TICK_RATE));
    // (the countdown does not start until the finisher is over)
    if (phase === FloorPhase.Cleared && world.tick < world.misc[MISC.Cine]!) this.setFloorCountdown(null, '', 0);
    else if (phase === FloorPhase.Cleared) this.setFloorCountdown(t.waveCleared, `${t.climbIn}`, secsLeft);
    else if (phase === FloorPhase.Arrive) this.setFloorCountdown(`${t.arrivedTitle} ${world.wave}`, t.getReady, secsLeft);
    else this.setFloorCountdown(null, '', 0);
    (this.hud.querySelector('#h-xp') as HTMLElement).style.width = `${Math.min(100, (world.pXp[slot]! / xpForNext(world, slot)) * 100)}%`;

    // boss bar
    const boss = wv.bossIndex;
    const bb = this.hud.querySelector<HTMLElement>('#h-bossbar')!;
    const bl = this.hud.querySelector<HTMLElement>('#h-bosslabel')!;
    bb.style.display = bl.style.display = boss >= 0 ? 'block' : 'none';
    if (boss >= 0) {
      (this.hud.querySelector('#h-boss') as HTMLElement).style.width = `${wv.bossHealthFraction * 100}%`;
      bl.textContent = t.boss;
    }

    // squad: one card per player with a smooth health bar (and its number), shield and the upgrades they carry
    let squad = '';
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s]) continue;
      const st = world.pState[s]!;
      const maxHp = world.pMaxHp[s]!;
      const frac = wv.healthFraction(s);
      const col = this.slotColor(s);
      const down = st === PlayerState.Downed;
      const num = st === PlayerState.Alive ? `${Math.ceil(world.pHp[s]!)}<small>/${Math.round(maxHp)}</small>` : down ? `${Math.ceil(world.pTimer[s]!)}s` : icon('hud_cross', 14);
      const fill = down ? '#f0a020' : `hsl(${Math.round(Math.max(0, Math.min(1, frac)) * 120)} 72% 46%)`;
      const shield = Math.max(0, Math.min(100, world.pPerk[s * PERKS + PERK.Shield]!));
      let chips = '';
      for (let k = 0; k < POWERS.length; k++) {
        const lv = POWERS[k]!.level(world, s);
        if (lv < 0.005) continue;
        chips += `<span class="chip" data-tip="chip" data-s="${s}" data-k="${k}" style="--c:${POWERS[k]!.color}"><i>${chipIcon(POWERS[k]!.id, 16)}</i>${Math.round(lv * 100)}%</span>`;
      }
      const haste = world.pPerk[s * PERKS + PERK.Haste]!;
      const quad = world.pPerk[s * PERKS + PERK.Quad]!;
      if (haste > 0) chips += `<span class="chip timed" style="--c:#ffd21f"><i>${icon('chip_haste', 16)}</i>${Math.ceil(haste)}s</span>`;
      if (quad > 0) chips += `<span class="chip timed" style="--c:#b45cff"><i>${icon('chip_quad', 16)}</i>${Math.ceil(quad)}s</span>`;
      squad += `<div class="wrh-pc${s === slot ? ' me' : ''}${wv.lowHealth(s) ? ' low' : ''}" style="--pc:${col};opacity:${st === PlayerState.Dead ? 0.45 : 1}">` +
        `<div class="top" data-tip="pc" data-s="${s}"><span class="wrh-dot" style="background:${col}"></span><b>${esc(names[s] ?? 'P' + (s + 1))}</b>${s === slot ? `<i class="you">${t.youBadge}</i>` : ''}${world.pDrone[s] ? `<span class="dr-chip">${icon('drone_' + (world.pDrone[s]! - 1), 14)}${world.pDLv[s * DRONE_TYPES.length + world.pDrone[s]! - 1]}</span>` : ''}${down ? ' ' + icon('hud_skull', 14) : ''}${world.pOffer[s * 3]! >= 0 ? `<i class="pick" title="${t.choosing}">&#9679;</i>` : ''}<span class="lv">${t.lvShort} ${world.pLevel[s]}</span><em>${num}</em></div>` +
        `<div class="bar"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%;background:${fill}"></i>${shield > 0 ? `<s style="width:${shield}%"></s>` : ''}</div>` +
        `<div class="stats" data-tip="pc" data-s="${s}"><span>${t.dpsLabel} <b>${Math.round(this.dpsOf(world, s, now))}</b></span><span>${icon('go_kills', 14)} <b>${Math.round(world.pPerk[s * PERKS + PERK.Kills]!)}</b></span></div>` +
        (chips ? `<div class="chips">${chips}</div>` : '') +
        '</div>';
    }
    set('h-squad', squad);
    set('h-drone', this.droneHtml(world, slot, now));
    if (this.squadTip && this.tipEl.style.display === 'block') this.tipEl.innerHTML = this.squadTipHtml(world);

    // local player
    if (world.pActive[slot]) {
      const reloading = wv.reloading(slot);
      const dashReady = world.pDashCd[slot]! <= 0;
      const dashText = dashReady ? '' : `${Math.ceil(world.pDashCd[slot]!)}s`;
      const specReady = world.pSpecCd[slot]! <= 0;
      const specOn = world.pSpecT[slot]! > 0;
      const specText = specOn ? `${world.pSpecT[slot]!.toFixed(1)}s` : specReady ? icon('hud_check', 16) : `${Math.ceil(world.pSpecCd[slot]!)}s`;
      const cls = Math.round(world.pPerk[slot * PERKS + PERK.Class]!);
      const abName = (t.abilityNames as readonly string[])[cls] ?? '';
      const gear = (kind: string, icon: string, label: string, val: string, on: boolean, cd: boolean): string =>
        `<div class="g${on ? ' on' : ''}${cd ? ' cd' : ''}" data-tip="gear" data-g="${kind}"><i>${icon}</i><span>${label}</span><b>${val}</b></div>`;
      set(
        'h-me',
        gear('gren', icon('hud_grenade', 26), '', String(world.pGren[slot]), world.pGren[slot]! > 0, world.pGren[slot]! <= 0) +
          gear('dash', icon('hud_dash', 26), '', dashText || icon('hud_check', 16), dashReady, !dashReady) +
          gear('spec', icon('hud_ability', 26), esc(abName), specText, specReady || specOn, !specReady && !specOn),
      );
      this.gearInfo = { abName, cls };
      set('h-inv', inventoryHtml(this.t, world, slot));
      this.updateRelics(world, slot);
      const bar = this.hud.querySelector<HTMLElement>('#h-reload')!;
      bar.style.display = reloading ? 'block' : 'none'; // a charge shows over the character instead
      if (reloading) (bar.firstElementChild as HTMLElement).style.width = `${wv.reloadFraction(slot) * 100}%`;
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
        set('h-hint', '');
      }
    }

    if (world.gameOver) {
      this.warn('');
      set('h-hint', '');
    }
    // the level-up badge: how many levels wait for a card (the open offer counts)
    const lvlEl = this.hud.querySelector<HTMLElement>('#h-lvl')!;
    const waiting = world.gameOver || world.pState[slot] === PlayerState.Dead ? 0 : world.pPending[slot]! + (world.pOffer[slot * 3]! >= 0 ? 1 : 0);
    if (waiting > 0) {
      if (lvlEl.style.display !== 'flex') lvlEl.style.display = 'flex';
      const label = lvlEl.querySelector('b')!;
      const text = `x${waiting}`;
      if (label.textContent !== text) label.textContent = text;
      if (!this.lvlImgBound) {
        this.lvlImgBound = true;
        lvlEl.querySelector('img')!.addEventListener('error', () => lvlEl.classList.add('noimg'));
      }
    } else if (lvlEl.style.display !== 'none') lvlEl.style.display = 'none';
    // cards
    const cardsEl = this.hud.querySelector<HTMLElement>('#h-cards')!;
    if (world.pOffer[slot * 3]! >= 0 && !world.gameOver && world.pState[slot] === PlayerState.Alive) {
      const offer = [world.pOffer[slot * 3]!, world.pOffer[slot * 3 + 1]!, world.pOffer[slot * 3 + 2]!];
      const more = world.pPending[slot]!;
      const key = offer.join(',') + this.lang + more;
      if (key !== this.lastCards) {
        this.lastCards = key;
        const cards = t.cards as Record<string, readonly [string, string]>;
        cardsEl.innerHTML =
          `<h3>${t.pick}${more > 0 ? ` <span class="wrh-more">+${more}</span>` : ''}</h3>` +
          offer
            .map((c, i) => {
              const id = CARD_IDS[c]!;
              const rarity = CARD_RARITY[id];
              const team = TEAM_CARDS.includes(id);
              return `<div class="wrh-card r${rarity}" data-i="${i}"><kbd>${i + 1}</kbd><div class="art"><img src="${asset(`cards/${id}.png`)}" alt="" draggable="false"></div><b>${cards[id]![0]}</b><span>${cards[id]![1]}</span><em>${(t.rarity as readonly string[])[rarity]}${team ? ` &middot; ${t.teamTag}` : ''}</em></div>`;
            })
            .join('') +
          `<div class="wrh-cardtime"><i id="h-ct"></i></div>`;
        cardsEl.querySelectorAll<HTMLElement>('.wrh-card').forEach((el) => {
          el.onclick = () => this.h.onCard(Number(el.dataset.i));
        });
      }
      cardsEl.style.display = 'block';
      const ct = cardsEl.querySelector<HTMLElement>('#h-ct');
      if (ct) ct.style.width = `${Math.max(0, (world.pCardTimer[slot]! / (BALANCE.progression.cardSeconds * modFx(world.mods).cardSeconds * TICK_RATE)) * 100)}%`;
    } else {
      cardsEl.style.display = 'none';
      this.lastCards = '';
    }
  }
}
