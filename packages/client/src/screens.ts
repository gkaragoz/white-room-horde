import { esc } from './htmlUtil';
import { arenaThumb } from './arenaThumb';
import { weaponStatBars } from './weaponHtml';
import { icon } from './icons';
import { lobbyMarkup, menuMarkup } from './menu';
import { autoOpenReleaseNotes } from './releaseNotes';
import { TICK_RATE, BALANCE, Difficulty, MELEE_CLASSES, MAPS, MODS, MAX_PLAYERS, PLAYER_COLORS, PERK, PERKS, WEAPON_IDS, GAME_VERSION, compatibleVersions, type WeaponId } from '@wrh/shared';
import { type World } from '@wrh/sim';
import { asset } from './assets';
import { modsCardIcon, modsPanel, modsRow, modsSummary } from './modsUi';
import { achWords, isGot, markSeen, unreadCount } from './achievements';
import { achPage, runAchievementsHtml } from './achUi';
import { ACHIEVEMENTS, type AchievementDef } from '@wrh/shared';
import { renderGameOver, type RunExtras } from './gameOver';
import { discoverRelay } from './relay';
import { Preview } from './render/preview';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, loadRejoin, saveProfile, type MetaResult } from './profile';
import { META, colorLevel, levelOf, startWeapons, unlockLevelOf, unlocked, type Unlocked } from './meta';
import { type CodexCategory } from './codex';
import { BOT_BADGE, MAX_COMPANIONS, companionLimit, saveCompanions, xpFactor, isSkill, type CompanionChoice } from './companions';
import { SKILLS, type Skill } from '@wrh/bot';
import { codexPageHtml, codexSub, introHtml, levelPathHtml, runRewardHtml } from './metaUi';
import { fill, metaWords } from './metaStrings';
import type { UiHandlers } from './ui';
import type { Lang, StringSet } from './uiStrings';

/** What the player has picked in the menu or the lobby (also used to start a game without showing the menu). */
export interface MenuChoices {
  /** Starting weapon. */
  weapon: WeaponId;
  /** Arena (-1 random) picked for solo games. */
  map: number;
  /** The Difficulty picked for solo games. */
  mods: number;
  /** Accessory index. */
  acc: number;
  /** Vest colour index (-1: the slot's own colour). */
  color: number;
  /** Class index (see CLASS_IDS). */
  cls: number;
  /** Companion bots for solo games (the room's own choice lives in the lobby). */
  companions: CompanionChoice;
}

/** What the screens need from the Ui that owns them. */
export interface ScreensHost {
  readonly root: HTMLElement;
  /** The element the full-screen pages are drawn into. */
  readonly screen: HTMLElement;
  readonly handlers: UiHandlers;
  t(): StringSet;
  lang(): Lang;
  playerNames(): string[];
  slotColor(slot: number): string;
  toggleSettings(): void;
  settingsOpen(): boolean;
}

const CLASS_ICON = (i: number): string => icon(`class_${i}`, 40);

/**
 * The full-screen pages: main menu and its pages (play, weapons and class, difficulty), the online room, pause,
 * connecting, loading, achievements and the game-over screen. Each `show...` draws a page into `host.screen`; what the
 * player picked lives in `choices`, shared with whoever starts the game.
 */
export class Screens {
  constructor(
    private readonly host: ScreensHost,
    private readonly choices: MenuChoices,
  ) {}

  private preview: Preview | null = null;
  private previewMode: 'char' | 'weapon' = 'char';
  /** Remember how to draw the screen that is up, so a language change can draw it again with the typed text kept. */
  private redraw: (() => void) | null = null;

  redrawScreen(): void {
    if (!this.redraw) return;
    const typed = new Map<string, string>();
    this.host.screen.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      if (i.id) typed.set(i.id, i.value);
    });
    const scroll = this.host.screen.querySelector<HTMLElement>('.wrh-scroll')?.scrollTop ?? 0;
    this.keepMenuPage = true;
    try {
      this.redraw();
    } finally {
      this.keepMenuPage = false;
    }
    typed.forEach((v, id) => {
      const i = this.host.screen.querySelector<HTMLInputElement>('#' + id);
      if (i && !i.value) i.value = v;
    });
    const sc = this.host.screen.querySelector<HTMLElement>('.wrh-scroll');
    if (sc) sc.scrollTop = scroll;
  }

  /** Translate a UI string key (for messages the game shows outside the UI module). */
  tr(key: 'noServer' | 'noConnect' | 'connLost' | 'rejoinGone' | 'rejoinSeat' | 'desync' | 'reconnecting' | 'syncing' | 'joining'): string {
    return (this.host.t() as unknown as Record<string, string>)[key]!;
  }

  clearScreen(): void {
    this.redraw = null;
    this.lobbyCode = '';
    this.disposePreview();
    delete document.documentElement.dataset.menu;
    this.host.screen.innerHTML = '';
  }

  /** The name typed in the menu (or the remembered one). */
  name(): string {
    const el = this.host.screen.querySelector<HTMLInputElement>('#wrh-name');
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
    this.host.screen.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.onclick = () => {
        pick(el.getAttribute(`data-${attr}`)!);
        this.host.screen.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === el));
      };
    });
  }

  /** Look up the public relay and fill the server field with it unless the player typed their own address. */
  private async fillRelay(explicit: boolean): Promise<void> {
    const input = this.host.screen.querySelector<HTMLInputElement>('#wrh-server');
    const note = this.host.screen.querySelector<HTMLElement>('#wrh-relay-note');
    if (!input || !note) return;
    const own = input.value.trim();
    // a remembered address that is not a quick tunnel (those die) or one from the link is the player's choice
    if (explicit || (own && !/trycloudflare\.com/.test(own))) return;
    note.textContent = this.host.t().relayLooking;
    const relay = await discoverRelay();
    if (!note.isConnected) return;
    if (relay) {
      if (!input.value.trim() || /trycloudflare\.com/.test(input.value)) input.value = relay.url;
      note.textContent = `${this.host.t().relayOnline} (v${relay.version})`;
      note.style.color = '#2a8a3a';
    } else {
      note.textContent = this.host.t().relayOffline;
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

  /** What the player has open under the meta progression; null while it is off (then everything is open). */
  private lock(): Unlocked | null {
    return META.enabled ? unlocked(loadProfile()) : null;
  }

  /** The difficulty multipliers the level has not opened yet (a mask over MODS; 0 while the meta progression is off). */
  private lockedMods(): number {
    const lock = this.lock();
    return lock ? ~lock.mods & ((1 << MODS.length) - 1) : 0;
  }

  private classLockText(i: number): string {
    const at = unlockLevelOf('class', i);
    return at === 'ach' ? metaWords(this.host.lang()).lockedAchTip : this.lockTip(Number(at ?? 0));
  }

  private lockTip(level: number): string {
    return fill(metaWords(this.host.lang()).lockedTip, { n: level });
  }

  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  /** Tabs, the turntable, the arrows for the accessory or weapon and the name of what is shown. */
  private previewStage(): string {
    const t = this.host.t();
    return `<div class="wrh-tabs"><button type="button" class="wrh-wp${this.previewMode === 'char' ? ' on' : ''}" data-ptab="char">${t.tabChar}</button><button type="button" class="wrh-wp${this.previewMode === 'weapon' ? ' on' : ''}" data-ptab="weapon">${t.tabWeapon}</button></div>
      <div class="wrh-stage"><button type="button" class="wrh-arrow" data-pdir="-1" aria-label="previous">${icon('hud_left', 32)}</button><div class="wrh-canvas" id="wrh-prev-host"></div><button type="button" class="wrh-arrow" data-pdir="1" aria-label="next">${icon('hud_right', 32)}</button></div>
      <div class="wrh-prev-name" id="wrh-prev-name"></div><div class="wrh-prev-stats" id="wrh-prev-stats"></div>`;
  }

  private previewSwatches(): string {
    const lock = this.lock();
    const swatches = PLAYER_COLORS.map((c, i) => {
      const shut = lock !== null && !lock.colors[i];
      return `<button type="button" class="wrh-sw${i === this.choices.color ? ' on' : ''}${shut ? ' locked' : ''}" data-sw="${i}" style="background:${c}" aria-label="${c}"${shut ? ` disabled title="${esc(this.lockTip(colorLevel(i)))}"` : ''}></button>`;
    }).join('');
    return `<div class="wrh-swatches" id="wrh-swatches">${swatches}</div>`;
  }

  private classPicker(): string {
    const t = this.host.t();
    const tips = t.classTips as readonly string[];
    const lock = this.lock();
    const shut = (i: number): boolean => lock !== null && ((lock.classes >> i) & 1) === 0;
    const tip = (i: number): string => (shut(i) ? this.classLockText(i) : tips[i]!);
    return `<label style="margin-top:8px">${t.classTitle}</label>
      <div class="wrh-classes">${(t.classNames as readonly string[]).map((n, i) => `<button type="button" class="wrh-class${i === this.choices.cls ? ' on' : ''}${shut(i) ? ' locked' : ''}" data-cls="${i}"${shut(i) ? ' disabled' : ''} title="${esc(tip(i))}"><span class="ci">${CLASS_ICON(i)}</span><b>${n}</b></button>`).join('')}</div>
      <div class="wrh-class-tip" id="wrh-class-tip">${esc(tips[this.choices.cls]!)}</div>`;
  }

  /** Markup of the whole 3D preview block (the online room): turntable, colours and class. */
  private previewBlock(): string {
    return `<div class="wrh-prev">${this.previewStage()}${this.previewSwatches()}${this.classPicker()}</div>`;
  }

  /** Wire the preview block: arrows change the accessory (Character tab) or the weapon (Weapon tab), swatches the colour. */
  private bindPreview(): void {
    this.disposePreview();
    const host = this.host.screen.querySelector<HTMLElement>('#wrh-prev-host');
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
    const names = this.host.t().accs as readonly string[];
    const weaponNames = this.host.t().weapons as Record<string, string>;
    const unlockedWeapons = (): WeaponId[] => WEAPON_IDS.filter((w) => !BALANCE.weapons[w].melee && this.canStartWith(w));
    const refresh = (): void => {
      const colorHex = PLAYER_COLORS[this.choices.color >= 0 ? this.choices.color % PLAYER_COLORS.length : 0]!;
      const q = (id: string): HTMLElement => this.host.screen.querySelector<HTMLElement>('#' + id)!;
      q('wrh-prev-name').textContent = this.previewMode === 'char' ? (names[this.choices.acc] ?? '') : (weaponNames[this.choices.weapon] ?? '');
      q('wrh-prev-stats').innerHTML = this.previewMode === 'weapon' ? weaponStatBars(this.host.t(), this.choices.weapon) : '';
      this.host.screen.querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) => el.classList.toggle('on', el.dataset.ptab === this.previewMode));
      this.host.screen.querySelectorAll<HTMLElement>('[data-sw]').forEach((el) => el.classList.toggle('on', Number(el.dataset.sw) === this.choices.color));
      this.host.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => el.classList.toggle('on', el.dataset.w === this.choices.weapon));
      void this.preview?.set({ mode: this.previewMode, accessory: ACCESSORIES[this.choices.acc % ACCESSORIES.length]!, color: colorHex, weapon: this.choices.weapon });
      this.refreshHub();
    };
    this.host.screen.querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) => {
      el.onclick = () => {
        this.previewMode = el.dataset.ptab as 'char' | 'weapon';
        refresh();
      };
    });
    this.host.screen.querySelectorAll<HTMLElement>('[data-pdir]').forEach((el) => {
      el.onclick = () => {
        const dir = Number(el.dataset.pdir);
        if (this.previewMode === 'char') {
          const lock = this.lock();
          let next = this.choices.acc;
          for (let k = 0; k < ACCESSORIES.length; k++) {
            next = (next + dir + ACCESSORIES.length) % ACCESSORIES.length;
            if (!lock || lock.accessories[next]) break;
          }
          this.choices.acc = next;
          this.persistLook();
          this.host.handlers.onLook(this.choices.acc, this.choices.color, this.choices.cls);
        } else {
          const list = unlockedWeapons();
          const at = Math.max(0, list.indexOf(this.choices.weapon));
          this.choices.weapon = list[(at + dir + list.length) % list.length]!;
          this.host.handlers.onWeapon(this.choices.weapon);
        }
        refresh();
      };
    });
    this.host.screen.querySelectorAll<HTMLElement>('[data-cls]').forEach((el) => {
      el.onclick = () => {
        this.choices.cls = Number(el.dataset.cls);
        this.persistLook();
        this.host.handlers.onLook(this.choices.acc, this.choices.color, this.choices.cls);
        this.host.screen.querySelectorAll<HTMLElement>('[data-cls]').forEach((x) => x.classList.toggle('on', x === el));
        const tip = this.host.screen.querySelector<HTMLElement>('#wrh-class-tip');
        if (tip) tip.textContent = (this.host.t().classTips as readonly string[])[this.choices.cls] ?? '';
        this.dimWeapons();
        this.refreshHub();
      };
    });
    this.dimWeapons();
    this.host.screen.querySelectorAll<HTMLElement>('[data-sw]').forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset.sw);
        this.choices.color = this.choices.color === i ? -1 : i;
        this.persistLook();
        this.host.handlers.onLook(this.choices.acc, this.choices.color, this.choices.cls);
        refresh();
      };
    });
    // picking a weapon in the list also shows it
    this.host.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => {
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
    p.acc = this.choices.acc;
    p.color = this.choices.color;
    p.cls = this.choices.cls;
    p.map = this.choices.map;
    p.mods = this.choices.mods;
    saveProfile(p);
  }

  /** Option rows shared by the menu and the lobby: arena and difficulty (host or solo) and the player's look. */
  /** Arena pictures and the skull difficulty row (read-only text for guests in a lobby). */
  private arenaRows(editable: boolean, map: number, mods: number): string {
    const t = this.host.t();
    const names = t.maps as Record<string, string>;
    if (!editable) {
      const pic = map >= 0 ? `<img class="wrh-thumb-s" src="${arenaThumb(map)}" alt="">` : '<span class="wrh-thumb-s wrh-dice">?</span>';
      return `<div class="wrh-ro">${pic}<span><b>${names[String(map)]}</b></span></div><label>${t.difficulty}</label><div id="wrh-modsrow">${modsRow(this.host.lang(), mods, false)}</div>`;
    }
    const lock = this.lock();
    const cards = ['-1', ...MAPS.map((_, i) => String(i))]
      .map((id) => {
        const pic = id === '-1' ? '<span class="wrh-dice">?</span>' : `<img src="${arenaThumb(Number(id))}" alt="">`;
        const shut = lock !== null && id !== '-1' && ((lock.arenas >> Number(id)) & 1) === 0;
        const tip = shut ? ` disabled title="${esc(this.lockTip(Number(unlockLevelOf('arena', Number(id)) ?? 0)))}"` : '';
        return `<button type="button" class="wrh-arena${id === String(map) ? ' on' : ''}${shut ? ' locked' : ''}" data-map="${id}"${tip}>${pic}<span>${names[id]}</span></button>`;
      })
      .join('');
    return `<label>${t.arena}</label><div class="wrh-arenas">${cards}</div><label>${t.difficulty}</label><div id="wrh-modsrow">${modsRow(this.host.lang(), mods, true)}</div>`;
  }

  /** The page of the main menu that is showing ('hub' is the card hub). */
  private menuPage = 'hub';
  private escBound = false;
  private keepMenuPage = false;

  private home(): HTMLElement | null {
    return this.host.screen.querySelector<HTMLElement>('.wrh-home[data-page]');
  }

  /** Open a page of the main menu: the 3D stage moves to the page that wants it and the keyboard focus to its Back button. */
  private goPage(page: string, focus = true): void {
    const home = this.home();
    if (!home) return;
    this.menuPage = page;
    home.dataset.page = page;
    const stage = this.host.screen.querySelector<HTMLElement>('#wrh-stagebox');
    const slot = this.host.screen.querySelector<HTMLElement>(`.wrh-slot[data-slot="${page}"]`);
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
    if (this.host.settingsOpen()) {
      this.host.toggleSettings();
      return;
    }
    const online = this.host.screen.querySelector<HTMLElement>('#wrh-online-panel');
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
      const e = this.host.screen.querySelector<HTMLElement>('#' + id);
      if (e) e.textContent = text;
    };
    const w = (this.host.t().weapons as Record<string, string>)[this.choices.weapon] ?? '';
    const c = (this.host.t().classNames as readonly string[])[this.choices.cls] ?? '';
    const line = MELEE_CLASSES.includes(this.choices.cls) ? c : `${w} · ${c}`;
    set('wrh-hc-loadout', line);
    set('wrh-loadline', line);
    const wi = this.host.screen.querySelector<HTMLElement>('#wrh-hc-wicon');
    if (wi) wi.innerHTML = this.weaponCardIcon();
    set('wrh-hc-mods', modsSummary(this.host.lang(), this.choices.mods));
    const mi = this.host.screen.querySelector<HTMLElement>('#wrh-hc-micon');
    if (mi) mi.innerHTML = modsCardIcon(this.choices.mods);
  }

  private weaponCardIcon(): string {
    return `<img src="${asset(`ui/wpn_${this.choices.weapon}.png`)}" alt="" draggable="false">`;
  }

  private codexTab: CodexCategory = 'weapon';
  /** The profile the Codex page was last drawn from (kept so the "new!" badges stay while the page is open). */
  private codexProfile: ReturnType<typeof loadProfile> | null = null;

  /** Draw the Codex page; the first time after it opens the "new!" badges are shown and then cleared from the save. */
  private drawCodex(fresh: boolean): void {
    const host = this.host.screen.querySelector<HTMLElement>('#wrh-codex-page');
    if (!host) return;
    if (fresh || !this.codexProfile) {
      this.codexProfile = loadProfile();
      const saved = loadProfile();
      if (saved.seenNew.length) {
        saved.seenNew = [];
        saveProfile(saved);
      }
    }
    const scroll = host.scrollTop;
    host.innerHTML = codexPageHtml(this.codexProfile, this.codexTab, this.host.t(), this.host.lang());
    host.querySelectorAll<HTMLElement>('[data-ctab]').forEach((b) => {
      b.onclick = () => {
        this.codexTab = b.dataset.ctab as CodexCategory;
        this.drawCodex(false);
      };
    });
    host.scrollTop = scroll;
  }

  private bindCodex(): void {
    this.codexProfile = null;
    this.drawCodex(false);
    const open = this.host.screen.querySelector<HTMLElement>('#wrh-open-codex');
    if (open) open.addEventListener('click', () => this.drawCodex(true));
  }

  /** The one-time note for a player whose old save moved to the new system. */
  private showIntro(): void {
    const wrap = document.createElement('div');
    wrap.innerHTML = introHtml(this.host.lang());
    const modal = wrap.firstElementChild as HTMLElement;
    document.body.appendChild(modal);
    modal.querySelector<HTMLElement>('#wrh-intro-ok')!.onclick = () => {
      const p = loadProfile();
      p.introSeen = true;
      saveProfile(p);
      modal.remove();
    };
  }

  /** The Difficulty page: the same multiplier grid the room uses, drawn in the page. */
  private drawModsPage(): void {
    const host = this.host.screen.querySelector<HTMLElement>('#wrh-mods-page');
    if (!host) return;
    const scroll = host.scrollTop;
    host.innerHTML = modsPanel(this.host.lang(), this.choices.mods, true, true, this.lockedMods());
    host.querySelectorAll<HTMLElement>('.wrh-mod').forEach((b) => {
      b.onclick = () => this.setMods(Difficulty.toggle(this.choices.mods, Number(b.dataset.mod)));
    });
    const all = host.querySelector<HTMLElement>('#wrh-mods-all');
    if (all) all.onclick = () => this.setMods(Difficulty.ALL & ~this.lockedMods());
    const none = host.querySelector<HTMLElement>('#wrh-mods-none');
    if (none) none.onclick = () => this.setMods(0);
    host.scrollTop = scroll;
  }

  private setMods(v: number): void {
    this.choices.mods = v;
    this.persistLook();
    this.drawModsPage();
    this.refreshHub();
    const row = this.host.screen.querySelector<HTMLElement>('#wrh-modsrow');
    if (row) {
      row.innerHTML = modsRow(this.host.lang(), this.choices.mods, true);
      this.bindMenuMods();
    }
  }

  /** In the main menu the difficulty summary on the Play page opens the Difficulty page. */
  private bindMenuMods(): void {
    const open = this.host.screen.querySelector<HTMLElement>('#wrh-mods-open');
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
    const t = this.host.t();
    const profile = loadProfile();
    this.choices.acc = profile.acc;
    this.choices.color = profile.color;
    this.choices.cls = profile.cls;
    this.choices.map = profile.map;
    this.choices.mods = profile.mods;
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
    this.comp = { ...this.choices.companions };
    this.compMax = companionLimit(1);
    const ach = achWords(this.host.lang());
    const got =ACHIEVEMENTS.filter((a) => isGot(a, profile.ach)).length;
    this.host.screen.innerHTML = menuMarkup({
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
      arenaHtml: this.arenaRows(true, this.choices.map, this.choices.mods),
      companionsHtml: this.companionsInner(),
      modsHtml: modsPanel(this.host.lang(), this.choices.mods, true, true, this.lockedMods()),
      soloLabel: t.solo,
      hostLabel: t.host,
      joinLabel: t.join,
      onlineLabel: t.online,
      settingsLabel: t.settings,
      achLabel: ach.title,
      achUnread: unreadCount(profile.ach),
      achSub: `${got} / ${ACHIEVEMENTS.length} ${ach.earned}`,
      closeLabel: t.close,
      meta: META.enabled ? { path: levelPathHtml(profile, t, this.host.lang()), codexLabel: metaWords(this.host.lang()).codex, codexSub: codexSub(profile, this.host.lang()), codexPage: codexPageHtml(profile, this.codexTab, t, this.host.lang()) } : undefined,
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
        modsSub: modsSummary(this.host.lang(), this.choices.mods),
        modsIcon: modsCardIcon(this.choices.mods),
        settingsSub: t.hubSettingsSub,
        change: t.change,
        achIcon: asset('ui/ach_menu.webp'),
      },
    });
    this.bindWeapons();
    this.bindPreview();
    this.refreshHub();
    this.compOnChange = (c) => {
      this.choices.companions = { ...c };
      saveCompanions(c);
    };
    this.drawCompanions();
    void this.fillRelay(fromParam !== null);
    this.bindGroup('map', (id) => {
      this.choices.map = Number(id);
      this.persistLook();
    });
    this.drawModsPage();
    this.bindMenuMods();
    if (META.enabled) {
      this.bindCodex();
      if (!profile.introSeen) this.showIntro();
    }
    const q = <E extends HTMLElement>(id: string): E => this.host.screen.querySelector<E>('#' + id)!;
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
    q('wrh-solo').onclick = () => this.host.handlers.onSolo(name());
    q('wrh-host').onclick = () => this.host.handlers.onHost(name(), q<HTMLInputElement>('wrh-server').value.trim(), pass());
    q('wrh-join').onclick = () => this.host.handlers.onJoin(name(), q<HTMLInputElement>('wrh-code').value.trim().toUpperCase(), q<HTMLInputElement>('wrh-server').value.trim(), pass());
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
    this.host.screen.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
      el.addEventListener('click', () => this.goPage(el.dataset.go!));
    });
    q('wrh-open-settings').onclick = () => this.host.toggleSettings();
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
    const rj = this.host.screen.querySelector<HTMLElement>('#wrh-rejoin');
    if (rj) rj.onclick = () => this.host.handlers.onRejoin();
    // a new version: its release notes open by themselves (once)
    autoOpenReleaseNotes();
  }

  /** Pause screen (solo only; online games keep running). */
  showPause(): void {
    this.redraw = () => this.showPause();
    this.lobbyCode = '';
    const t = this.host.t();
    delete document.documentElement.dataset.menu;
    this.host.screen.innerHTML = `<div class="wrh-panel wrh-center" style="text-align:center"><h1>${t.paused}</h1>
      <button id="wrh-resume">${t.resume}</button><button id="wrh-pset" class="alt">${t.settings}</button><button id="wrh-leave" class="warn">${t.leave}</button></div>`;
    this.host.screen.querySelector<HTMLElement>('#wrh-resume')!.onclick = () => this.host.handlers.onResume();
    this.host.screen.querySelector<HTMLElement>('#wrh-pset')!.onclick = () => this.host.toggleSettings();
    this.host.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.host.handlers.onLeave();
  }

  weaponName(id: string): string {
    return (this.host.t().weapons as Record<string, string>)[id] ?? id;
  }


  /** May this gun be a starting weapon: under the meta progression the pistol, the SMG and the guns met in the Codex; otherwise by the best floor. */
  private canStartWith(w: WeaponId): boolean {
    const profile = loadProfile();
    return META.enabled ? startWeapons(profile).includes(w) : isUnlocked(w, profile);
  }

  /** Why a gun is not a starting weapon under the meta progression: its level has not come, or it has not been met yet. */
  private weaponLockText(w: WeaponId, profile: ReturnType<typeof loadProfile>, words: ReturnType<typeof metaWords>): string {
    const at = unlockLevelOf('weapon', WEAPON_IDS.indexOf(w));
    return typeof at === 'number' && at > levelOf(profile) ? fill(words.lockedTip, { n: at }) : words.startLocked;
  }

  private weaponButtons(): string {
    const names = this.host.t().weapons as Record<string, string>;
    const profile = loadProfile();
    const meta = metaWords(this.host.lang());
    return WEAPON_IDS.filter((w) => !BALANCE.weapons[w].melee).map((w) => {
      const ok = this.canStartWith(w);
      return `<button type="button" class="wrh-wp${w === this.choices.weapon ? ' on' : ''}${ok ? '' : ' locked'}" data-w="${w}"${ok ? '' : ` aria-disabled="true" data-lock="${WEAPON_UNLOCK[w]}"${META.enabled ? ` data-locktext="${esc(this.weaponLockText(w, profile, meta))}"` : ''}`}>${ok ? '' : icon('hud_lock', 16) + ' '}<img class="wp-i" src="${asset(`ui/wpn_${w}.png`)}" alt="" draggable="false">${names[w]}</button>`;
    }).join('');
  }

  /** Blade and hammer classes fight with their own weapon: the list of guns is greyed out for them. */
  private dimWeapons(): void {
    const melee = MELEE_CLASSES.includes(this.choices.cls);
    this.host.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((x) => x.classList.toggle('dim', melee));
  }

  private bindWeapons(): void {
    this.host.screen.querySelectorAll<HTMLElement>('.wrh-wp[data-w]').forEach((el) => {
      el.onclick = () => {
        if (el.classList.contains('locked')) return; // locked guns only explain themselves (hover tip)
        this.choices.weapon = el.dataset.w as WeaponId;
        this.host.screen.querySelectorAll('.wrh-wp[data-w]').forEach((x) => x.classList.toggle('on', x === el));
        this.host.handlers.onWeapon(this.choices.weapon);
      };
    });
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
      this.host.root.appendChild(el);
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
    this.host.screen.innerHTML = `<div class="wrh-panel wrh-center"><h1>${this.host.t().connecting}</h1></div>`;
  }

  /** What the lobby on screen was built for: while it stays the same, updates only touch the list and the arena rows. */
  private lobbyCode = '';
  private lobbyHost = false;
  private lobbyLocked = false;
  private lobbyOpts = '';
  private lobbyMap = 0;
  private lobbyMods = 0;

  private lobbyList(players: { slot: number; name: string; host: boolean; weapon: WeaponId; acc: number; color: number; cls?: number; bot?: boolean }[]): string {
    const t = this.host.t();
    const accNames = t.accs as readonly string[];
    const classNames = t.classNames as readonly string[];
    return players
      .map((p) => {
        const dot = `<span class="wrh-dot" style="background:${p.color >= 0 ? PLAYER_COLORS[p.color % PLAYER_COLORS.length] : PLAYER_COLORS[p.slot % PLAYER_COLORS.length]}"></span>`;
        if (p.bot) return `<li class="wrh-botrow">${dot}${BOT_BADGE}${esc(p.name)}<span class="wrh-bottag">${esc(t.botTag)}</span> <small style="opacity:.7">&middot; ${esc(classNames[p.cls ?? 0] ?? '')} &middot; ${(t.weapons as Record<string, string>)[p.weapon]}</small></li>`;
        return `<li>${dot}${esc(p.name)} ${p.host ? `<small>(${t.host_tag})</small>` : ''} <small style="opacity:.7">&middot; ${(t.weapons as Record<string, string>)[p.weapon]} &middot; ${accNames[p.acc] ?? ''}</small></li>`;
      })
      .join('');
  }

  // ---- companions: how many bots fight alongside and how well they play ----
  private comp: CompanionChoice = { count: 0, skill: 'expert' };
  private compMax = MAX_COMPANIONS;
  private compOnChange: ((c: CompanionChoice) => void) | null = null;

  /** The inside of the Companions picker for the current state: count buttons 0..max, the skill row once there are bots, a hint. */
  private companionsInner(): string {
    const t = this.host.t();
    const max = this.compMax;
    const counts = Array.from({ length: MAX_COMPANIONS + 1 }, (_, n) => `<button type="button" class="wrh-wp${n === this.comp.count ? ' on' : ''}" data-ccount="${n}"${n > max ? ' disabled' : ''} aria-label="${n}">${n}</button>`).join('');
    const skills = SKILLS.map((s) => `<button type="button" class="wrh-wp${s === this.comp.skill ? ' on' : ''}" data-cskill="${s}">${esc((t.botSkills as Record<string, string>)[s] ?? s)}</button>`).join('');
    const hint = this.comp.count > 0 ? t.companionsXp.replace('{f}', xpFactor(this.comp.count).toFixed(2)) : t.companionsTip;
    return `<label>${BOT_BADGE}${esc(t.companions)}</label><div class="wrh-seg" role="group" aria-label="${esc(t.companions)}">${counts}</div>${this.comp.count > 0 ? `<div class="wrh-comp-skill"><label>${esc(t.botSkill)}</label><div class="wrh-seg" role="group" aria-label="${esc(t.botSkill)}">${skills}</div></div>` : ''}<p class="wrh-comp-hint">${esc(hint)}</p>`;
  }

  /** Draw the picker into its box and wire the buttons; a pick updates the state and tells whoever listens. */
  private drawCompanions(): void {
    const box = this.host.screen.querySelector<HTMLElement>('#wrh-comp');
    if (!box) return;
    box.innerHTML = this.companionsInner();
    box.querySelectorAll<HTMLElement>('[data-ccount]').forEach((b) => {
      b.onclick = () => {
        this.comp = { ...this.comp, count: Math.min(this.compMax, Number(b.dataset.ccount)) };
        this.compOnChange?.(this.comp);
        this.drawCompanions();
      };
    });
    box.querySelectorAll<HTMLElement>('[data-cskill]').forEach((b) => {
      b.onclick = () => {
        const s = b.dataset.cskill;
        if (!isSkill(s)) return;
        this.comp = { ...this.comp, skill: s };
        this.compOnChange?.(this.comp);
        this.drawCompanions();
      };
    });
  }

  /** The state of the picker from outside (the room says how many bots it holds and at what skill). */
  private setCompanions(c: CompanionChoice, max: number): void {
    this.comp = { count: Math.min(c.count, max), skill: c.skill };
    this.compMax = max;
    this.drawCompanions();
  }

  /** The Companions the Play page would start a solo game with. */
  soloCompanions(): CompanionChoice {
    return { ...this.choices.companions };
  }

  private bindArena(): void {
    this.bindGroup('map', (id) => {
      this.lobbyMap = Number(id);
      this.host.handlers.onOptions(this.lobbyMap, this.lobbyMods);
    });
    this.bindMods(true, () => this.lobbyMods, (v) => {
      this.lobbyMods = v;
      this.host.handlers.onOptions(this.lobbyMap, this.lobbyMods);
    });
  }

  /** The multipliers button opens the full-screen grid; the host (or a solo player) toggles, guests only read. */
  private bindMods(editable: boolean, get: () => number, set: (v: number) => void): void {
    const open = this.host.screen.querySelector<HTMLElement>('#wrh-mods-open');
    if (!open) return;
    open.onclick = () => this.openMods(editable, get, set);
  }

  private openMods(editable: boolean, get: () => number, set: (v: number) => void): void {
    const modal = document.createElement('div');
    modal.className = 'wrh-modal';
    const draw = (): void => {
      modal.innerHTML = modsPanel(this.host.lang(), get(), editable);
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
      const row = this.host.screen.querySelector<HTMLElement>('#wrh-modsrow');
      if (row) {
        row.innerHTML = modsRow(this.host.lang(), get(), editable);
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
    players: { slot: number; name: string; host: boolean; connected: boolean; weapon: WeaponId; acc: number; color: number; cls?: number; bot?: boolean }[],
    iAmHost: boolean,
    options: { map: number; mods: number } = { map: 0, mods: 0 },
    locked = false,
    botSkill: Skill = 'expert',
  ): void {
    this.redraw = () => {
      this.lobbyCode = '';
      this.showLobby(code, players, iAmHost, options, locked, botSkill);
    };
    const bots = players.filter((p) => p.bot).length;
    const roomComp: CompanionChoice = { count: bots, skill: botSkill };
    const roomMax = companionLimit(players.length - bots);
    const t = this.host.t();
    // somebody else changed something (joined, picked a weapon, the host chose an arena): update in place. Rebuilding the
    // whole lobby would reset the scroll position, the 3D preview and whatever the player is clicking.
    if (this.lobbyCode === code && this.lobbyHost === iAmHost && this.lobbyLocked === locked && this.host.screen.querySelector('#wrh-lobby')) {
      this.host.screen.querySelector<HTMLElement>('#wrh-plist')!.innerHTML = this.lobbyList(players);
      this.host.screen.querySelector<HTMLElement>('#wrh-pcount')!.textContent = `${t.players} (${players.length}/${MAX_PLAYERS})`;
      if (iAmHost) this.setCompanions(roomComp, roomMax);
      const key = `${options.map}/${options.mods}`;
      if (key !== this.lobbyOpts) {
        this.lobbyOpts = key;
        this.lobbyMap = options.map;
        this.lobbyMods = options.mods;
        this.host.screen.querySelector<HTMLElement>('#wrh-arena-wrap')!.innerHTML = this.arenaRows(iAmHost, options.map, options.mods);
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
    this.host.screen.innerHTML = lobbyMarkup({
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
      companionsHtml: iAmHost ? ((this.comp = roomComp), (this.compMax = roomMax), this.companionsInner()) : '',
      startHtml: iAmHost ? `<button id="wrh-start">${t.start}</button>` : '',
      inviteHtml: `<button id="wrh-invite" class="alt">${icon('hud_link', 18)} ${t.invite}</button>`,
      leaveLabel: t.leave,
    });
    this.bindWeapons();
    this.bindPreview();
    if (iAmHost) {
      this.compOnChange = (c) => this.host.handlers.onCompanions?.(c.count, c.skill);
      this.drawCompanions();
    }
    if (iAmHost) this.bindArena();
    else this.bindMods(false, () => this.lobbyMods, () => undefined);
    const s = this.host.screen.querySelector<HTMLElement>('#wrh-start');
    if (s) s.onclick = () => this.host.handlers.onStart();
    this.host.screen.querySelector<HTMLElement>('#wrh-leave')!.onclick = () => this.host.handlers.onLeave();
    const inv = this.host.screen.querySelector<HTMLElement>('#wrh-invite');
    if (inv) {
      inv.onclick = () => {
        const link = this.inviteLink(code);
        const done = (): void => {
          inv.textContent = '✔ ' + this.host.t().inviteCopied;
        };
        (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error('no clipboard'))).then(done, () => {
          window.prompt(this.host.t().invite, link);
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
    const t = this.host.t();
    return rows
      .map((r, i) => `<div class="wrh-statrow"><span class="wrh-dot" style="background:${this.host.slotColor(r.s)}"></span>${esc(this.host.playerNames()[r.s] ?? 'P' + (r.s + 1))}: <b>${r.k}</b> ${t.squadKills}${i === 0 && r.k > 0 ? ` &middot; &#127942; <b>${t.mvp}</b>` : ''}</div>`)
      .join('');
  }

  private goStop: (() => void) | null = null;

  /** The game-over page: the run in numbers, revealed one card at a time (a click shows them all). */
  /** The full-screen achievements page. Opening it counts as having seen everything earned so far (the red badge goes away). */
  showAchievements(): void {
    const page = document.createElement('div');
    page.className = 'wrh-ach';
    page.innerHTML = achPage(this.host.lang(), loadProfile().ach);
    markSeen();
    this.host.screen.querySelector('#wrh-ach-badge')?.remove();
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

  /** Reward packs the player has opened on the game over screen (they stay open when the page is drawn again). */
  private readonly packsOpened = new Set<number>();
  private packsBound = false;
  private packMeta: MetaResult | undefined;

  /** Clicking a face-down pack turns it over; "Open all" turns the rest. One listener on the screen, because the page is rebuilt now and then. */
  private bindPacks(meta: MetaResult | undefined): void {
    this.packMeta = meta;
    if (this.packsBound) return;
    this.packsBound = true;
    this.host.screen.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const pack = target.closest<HTMLElement>('[data-pack]');
      const all = target.closest<HTMLElement>('#wrh-openall');
      if (!pack && !all) return;
      const open = (el: HTMLElement): void => {
        this.packsOpened.add(Number(el.dataset.pack));
        el.classList.add('open');
      };
      if (pack) {
        open(pack);
        this.host.handlers.onUiSound('confirm');
      } else this.host.screen.querySelectorAll<HTMLElement>('[data-pack]').forEach(open);
      const left = this.host.screen.querySelectorAll('[data-pack]:not(.open)').length;
      const btn = this.host.screen.querySelector<HTMLElement>('#wrh-openall');
      if (btn && left < 2) btn.remove();
    });
  }

  showGameOver(world: World, rec?: { newWave: boolean; newKills: boolean; unlocked: WeaponId[]; ach?: readonly AchievementDef[]; meta?: MetaResult }, extras: RunExtras = { clicks: 0, keys: 0, bestCombo: 0 }, instant = false, slot = 0): void {
    this.redraw = () => this.showGameOver(world, rec, extras, true, slot);
    if (!instant) this.packsOpened.clear();
    this.lobbyCode = '';
    this.goStop?.();
    const t = this.host.t();
    const names = t.weapons as Record<string, string>;
    const extra = rec
      ? `${rec.newWave || rec.newKills ? `<p style="color:#d8862e;font-weight:800">${t.newBest}</p>` : ''}${rec.unlocked.length ? `<p>${icon('hud_unlock', 18)} ${t.unlockedWeapon}: <b>${rec.unlocked.map((w) => names[w]).join(', ')}</b></p>` : ''}`
      : '';
    const head = `<h1>${t.over}</h1>
      <p>${t.reached} <b>${world.wave}</b> &middot; ${t.kills} <b>${world.kills}</b> &middot; ${t.level} <b>${Math.max(1, ...Array.from(world.pLevel).filter((_, i) => world.pActive[i]))}</b></p>${extra}${this.squadStats(world)}`;
    const r = renderGameOver({
      world,
      screen: this.host.screen,
      lang: this.host.lang(),
      slot,
      playerNames: this.host.playerNames(),
      slotColor: (s) => this.host.slotColor(s),
      weaponName: (id) => names[WEAPON_IDS[id]!] ?? '',
      head,
      foot: `${META.enabled && rec?.meta ? runRewardHtml(rec.meta, { opened: this.packsOpened }, t, this.host.lang(), world.tick / TICK_RATE) : ''}${runAchievementsHtml(this.host.lang(), rec?.ach ?? [])}<button id="wrh-again">${t.again}</button>`,
      tick: (_i, last) => this.host.handlers.onUiSound(last ? 'confirm' : 'click'),
      instant,
      extras: { ...extras, slot },
    });
    this.goStop = r.stop;
    this.bindPacks(rec?.meta);
    const again = (): void => {
      this.host.screen.querySelector<HTMLElement>('#wrh-again')!.onclick = () => this.host.handlers.onAgain();
    };
    again();
    // the page is rebuilt when a player tab is chosen: the button needs its handler again
    new MutationObserver(again).observe(this.host.screen, { childList: true });
  }
}
