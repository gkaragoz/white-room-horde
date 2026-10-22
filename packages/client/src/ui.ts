import { LANGS, UI_STRINGS, type Lang } from './uiStrings';
import { loadCompanions } from './companions';
import type { Skill } from '@wrh/bot';
import { CSS } from './uiStyles';
import { Hud } from './hud';
import { Screens, type MenuChoices } from './screens';
import { Minimap } from './minimap';
import { WorldOverlay } from './worldOverlay';

export { LANGS, UI_STRINGS, type Lang };
import { icon } from './icons';
import { CLASS_IDS, PLAYER_COLORS, type WeaponId } from '@wrh/shared';
import { ACTIONS } from './input';
import { renderSettingsPanel } from './settingsPanel';
import { loadProfile } from './profile';

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
  /** The host picked how many companion bots (and how well they play) the room gets. */
  onCompanions?(count: number, skill: Skill): void;
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

export class Ui {
  readonly root = document.createElement('div');
  /** Names, arrows, rings and numbers drawn over the world. */
  readonly overlay = new WorldOverlay(this.root);
  /** What the player picked in the menu or the lobby. */
  readonly choices: MenuChoices = { weapon: 'pistol', map: -1, mods: 0, acc: 0, color: -1, cls: Math.max(0, Math.min(CLASS_IDS.length - 1, loadProfile().cls | 0)), companions: loadCompanions() }; // (the class is also the one of a game that starts without showing the menu)
  /** The full-screen pages: menu, room, pause, loading, game over. */
  readonly screens: Screens;
  /** The in-game HUD. */
  readonly hud: Hud;
  /** The radar in the HUD corner. */
  readonly minimap = new Minimap(
    () => this.hud.el.querySelector<HTMLCanvasElement>('#h-mini'),
    (slot) => this.slotColor(slot),
  );
  lang: Lang = 'en';
  /** Names of the players by slot (game over screen). */
  playerNames: string[] = [];
  /** Slots that are companion bots (marked in the squad list and over their heads). */
  botSlots: ReadonlySet<number> = new Set();
  /** Colour of a player slot as the game draws it (set by main from the lobby choices). */
  slotColor: (slot: number) => string = (s) => PLAYER_COLORS[s % PLAYER_COLORS.length]!;
  private readonly screen = document.createElement('div');
  private readonly dev = document.createElement('div');
  private readonly toolbar = document.createElement('div');
  private langPop: HTMLElement | null = null;
  private settingsOpen = false;
  private readonly settingsEl = document.createElement('div');
  constructor(
    parent: HTMLElement,
    private readonly h: UiHandlers,
    private settings: Settings,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = 'wrh-ui';
    this.screens = new Screens(
      {
        root: this.root,
        screen: this.screen,
        handlers: this.h,
        t: () => this.t,
        lang: () => this.lang,
        playerNames: () => this.playerNames,
        slotColor: (slot) => this.slotColor(slot),
        toggleSettings: () => this.toggleSettings(),
        settingsOpen: () => this.settingsOpen,
      },
      this.choices,
    );
    this.hud = new Hud({
      root: this.root,
      toolbar: this.toolbar,
      screen: this.screen,
      handlers: this.h,
      t: () => this.t,
      lang: () => this.lang,
      playerNames: () => this.playerNames,
      isBot: (slot) => this.botSlots.has(slot),
      slotColor: (slot) => this.slotColor(slot),
    });
    this.lang = settings.lang;
    document.documentElement.lang = this.lang;
    this.dev.className = 'wrh-hud-dev';
    this.root.append(this.hud.el, this.dev, this.screen, this.settingsEl, this.toolbar, this.hud.infoEl, this.hud.relicEl, this.hud.tipEl);
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

  private get t(): (typeof UI_STRINGS)['en'] {
    return UI_STRINGS[this.lang] as (typeof UI_STRINGS)['en'];
  }

  setDev(html: string): void {
    this.dev.innerHTML = html;
  }

  get powerupNames(): string[] {
    return this.t.powerups as unknown as string[];
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
    this.hud.resetCards();
    if (langChanged) {
      this.hud.rebuild();
      this.screens.redrawScreen();
    }
  }

}
