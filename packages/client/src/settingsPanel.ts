import type { Lang, Settings } from './ui';
import { keyLabel } from './input';

/**
 * The settings window and the controls sheet. Both are plain DOM built from small tables (tabs, groups, rows), so a new
 * setting is one line in `tabsFor`. Texts that are not translated for a language fall back to English.
 */
const EN = {
  settings: 'Settings',
  close: 'Close',
  reset: 'Reset to defaults',
  controls: 'Controls',
  tabGraphics: 'Graphics',
  tabAudio: 'Audio',
  tabGame: 'Gameplay',
  tabAccess: 'Accessibility',
  tabKeys: 'Keys',
  gRender: 'Rendering',
  gLight: 'Lighting and weather',
  gFx: 'Effects',
  gMix: 'Volume',
  gHud: 'On screen',
  gFeel: 'Feel',
  gLang: 'Language',
  gLook: 'Readability',
  renderer: 'Renderer',
  aa: 'Anti-aliasing',
  scale: 'Render scale',
  autoScale: 'Auto resolution',
  fpsCap: 'Frame limit',
  texture: 'Texture detail',
  shadows: 'Shadows',
  time: 'Time of day',
  dynLights: 'Real-time lights',
  bounce: 'Bounce light',
  weather: 'Rain',
  particles: 'Particles',
  gore: 'Blood and gibs',
  corpses: 'Corpses stay',
  shake: 'Screen shake',
  showFps: 'Show frame rate and network numbers',
  reportLabel: 'Something wrong? Problem report',
  reportButton: 'Download report',
  volume: 'Master volume',
  music: 'Music',
  sfx: 'Sound effects',
  voices: 'Zombie voices',
  uiSounds: 'Menu sounds',
  hitStop: 'Hit-stop on kills',
  damageNumbers: 'Damage numbers',
  announcer: 'Kill streak announcer',
  autoAim: 'Auto aim (nearest enemy or barrel)',
  ammoRing: 'Ammo ring at your feet',
  nameTags: 'Teammate name tags',
  minimap: 'Minimap',
  language: 'Language',
  colorblind: 'Colour-blind mode',
  textSize: 'Text size',
  on: 'On',
  off: 'Off',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  extra: 'Extra',
  short: 'Short',
  long: 'Long',
  day: 'Day',
  night: 'Night',
  cycle: 'Cycle',
  unlimited: 'Display rate',
  reloads: 'Needs a reload of the page',
  keysHint: 'Click a key, then press the new one.',
  resetKeys: 'Reset keys',
  showControls: 'Show the controls sheet',
  ctlTitle: 'Controls',
  ctlMove: 'Move',
  ctlMoveTip: 'Run around the arena',
  ctlAim: 'Aim',
  ctlAimTip: 'The character turns towards the cursor',
  ctlFire: 'Fire',
  ctlFireTip: 'Hold to keep shooting; the magazine is shown at your feet',
  ctlGrenade: 'Throw a grenade',
  ctlGrenadeTip: 'Thrown along your aim, explodes after a short fuse',
  ctlReload: 'Reload',
  ctlReloadTip: 'Also happens by itself when the magazine is empty',
  ctlWeapons: 'Pick weapon',
  ctlWeaponsTip: 'Click or tap the weapon in the list above the minimap. Ammo is unlimited; each weapon keeps its own magazine and its own reload',
  ctlDash: 'Dash',
  ctlDashTip: 'A quick burst of speed with a moment of invulnerability',
  ctlSpecial: 'Class ability',
  ctlSpecialTip: 'The special move of your class (it recharges): rally, heal pulse, fortify, burst, airstrike, overcharge, rampage, blade storm, ground slam',
  ctlRevive: 'Revive a teammate',
  ctlReviveTip: 'Hold next to a downed teammate; moving away interrupts it',
  ctlCards: 'Pick a card',
  ctlCardsTip: 'When you level up: press 1, 2 or 3 (outside the offer 1 and 2 select weapon slots)',
  ctlHostPause: 'Pause for everybody',
  ctlHostPauseTip: 'The host stops the game for the whole room; press again to resume (solo: pauses your game)',
  ctlPause: 'Pause / settings',
  ctlPauseTip: 'Stops a solo game',
  secKeyboard: 'Keyboard and mouse',
  secPad: 'Gamepad',
  padMove: 'Left stick: move',
  padAim: 'Right stick: aim and fire',
  padFire: 'Right trigger: fire',
  padGrenade: 'Left trigger: grenade',
  padReload: 'B: reload',
  padDash: 'A: dash',
  padRevive: 'X: revive',
  padSwitch: 'D-pad up/down: weapon list',
  padCards: 'D-pad: pick a card',
  padPause: 'Start: pause',
  mouseLeft: 'Left button',
  mouseRight: 'Right button',
  mouseMove: 'Move the mouse',
};

const TR: Partial<typeof EN> = {
  settings: 'Ayarlar',
  close: 'Kapat',
  reset: 'Varsayılana dön',
  controls: 'Kontroller',
  tabGraphics: 'Grafik',
  tabAudio: 'Ses',
  tabGame: 'Oynanış',
  tabAccess: 'Erişilebilirlik',
  tabKeys: 'Tuşlar',
  gRender: 'Görüntü',
  gLight: 'Işık ve hava',
  gFx: 'Efektler',
  gMix: 'Ses seviyesi',
  gHud: 'Ekranda',
  gFeel: 'His',
  gLang: 'Dil',
  gLook: 'Okunabilirlik',
  renderer: 'Çizici',
  aa: 'Kenar yumuşatma',
  scale: 'Çözünürlük ölçeği',
  autoScale: 'Otomatik çözünürlük',
  fpsCap: 'Kare sınırı',
  texture: 'Doku ayrıntısı',
  shadows: 'Gölgeler',
  time: 'Günün saati',
  dynLights: 'Gerçek zamanlı ışıklar',
  bounce: 'Sekme ışığı',
  weather: 'Yağmur',
  particles: 'Parçacıklar',
  gore: 'Kan ve parçalar',
  corpses: 'Cesetler kalır',
  shake: 'Ekran sarsıntısı',
  showFps: 'Kare hızı ve ağ bilgisini göster',
  reportLabel: 'Bir sorun mu var? Hata raporu',
  reportButton: 'Raporu indir',
  volume: 'Ana ses',
  music: 'Müzik',
  sfx: 'Ses efektleri',
  voices: 'Zombi sesleri',
  uiSounds: 'Menü sesleri',
  hitStop: 'Öldürmede kısa duraklama',
  damageNumbers: 'Hasar sayıları',
  announcer: 'Seri öldürme anonsu',
  autoAim: 'Otomatik nişan (en yakın düşman veya varil)',
  ammoRing: 'Ayaktaki mermi halkası',
  nameTags: 'Takım arkadaşı isimleri',
  minimap: 'Mini harita',
  language: 'Dil',
  colorblind: 'Renk körü modu',
  textSize: 'Yazı boyutu',
  on: 'Açık',
  off: 'Kapalı',
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  extra: 'Aşırı',
  short: 'Kısa',
  long: 'Uzun',
  day: 'Gündüz',
  night: 'Gece',
  cycle: 'Döngü',
  unlimited: 'Ekran hızı',
  reloads: 'Sayfanın yenilenmesi gerekir',
  keysHint: 'Bir tuşa tıkla, sonra yenisine bas.',
  resetKeys: 'Tuşları sıfırla',
  showControls: 'Kontrol sayfasını göster',
  ctlTitle: 'Kontroller',
  ctlMove: 'Hareket',
  ctlMoveTip: 'Arenada koş',
  ctlAim: 'Nişan',
  ctlAimTip: 'Karakter imlece doğru döner',
  ctlFire: 'Ateş',
  ctlFireTip: 'Basılı tut, şarjör ayağının dibinde görünür',
  ctlGrenade: 'Bomba at',
  ctlGrenadeTip: 'Nişan yönüne atılır, kısa fitilden sonra patlar',
  ctlReload: 'Şarjör doldur',
  ctlReloadTip: 'Şarjör boşalınca kendiliğinden de başlar',
  ctlWeapons: 'Silah seç',
  ctlWeaponsTip: 'Mini haritanın üstündeki listede silaha tıkla ya da dokun. Mermi sınırsız; her silah kendi şarjörünü ve kendi doldurmasını taşır',
  ctlDash: 'Atıl',
  ctlDashTip: 'Kısa süreli hız patlaması ve anlık dokunulmazlık',
  ctlSpecial: 'Sınıf yeteneği',
  ctlSpecialTip: 'Sınıfının özel hamlesi (şarj olur): ilham, şifa dalgası, tahkimat, hamle, hava saldırısı, aşırı yük, çılgınlık, kılıç fırtınası, yer darbesi',
  ctlRevive: 'Arkadaşı kaldır',
  ctlReviveTip: 'Yerdeki arkadaşın yanında basılı tut; uzaklaşırsan yarıda kalır',
  ctlCards: 'Kart seç',
  ctlCardsTip: 'Seviye atlayınca 1, 2 ya da 3 (teklif dışında 1 ve 2 silah yuvası seçer)',
  ctlHostPause: 'Herkes için duraklat',
  ctlHostPauseTip: 'Host tüm odanın oyununu durdurur; tekrar basınca devam eder (solo: oyununu durdurur)',
  ctlPause: 'Duraklat / ayarlar',
  ctlPauseTip: 'Tek kişilik oyunu durdurur',
  secKeyboard: 'Klavye ve fare',
  secPad: 'Oyun kolu',
  padMove: 'Sol çubuk: hareket',
  padAim: 'Sağ çubuk: nişan ve ateş',
  padFire: 'Sağ tetik: ateş',
  padGrenade: 'Sol tetik: bomba',
  padReload: 'B: şarjör doldur',
  padDash: 'A: atıl',
  padRevive: 'X: kaldır',
  padSwitch: 'Yön tuşları yukarı/aşağı: silah listesi',
  padCards: 'Yön tuşları: kart seç',
  padPause: 'Start: duraklat',
  mouseLeft: 'Sol tuş',
  mouseRight: 'Sağ tuş',
  mouseMove: 'Fareyi oynat',
};

const TABLES: Partial<Record<Lang, Partial<typeof EN>>> = { tr: TR };
export type PanelText = typeof EN;
export const panelText = (lang: Lang): PanelText => ({ ...EN, ...(TABLES[lang] ?? {}) });

export interface PanelContext {
  settings: Settings;
  lang: Lang;
  langs: { id: Lang; label: string }[];
  tab: string;
  scroll: number;
  actionNames: Record<string, string>;
  actions: readonly string[];
  bindings: Record<string, string[]>;
  onSetting(key: keyof Settings, value: number | string | boolean): void;
  onTab(tab: string): void;
  onRebind(action: string): void;
  onResetKeys(): void;
  onReset(): void;
  onClose(): void;
  onControls(): void;
  /** Download the problem report (frame times, network numbers, errors, settings). */
  onReport(): void;
}

type Choice = [value: string | number | boolean, label: string];
type Row =
  | { kind: 'slider'; key: keyof Settings; label: string; min: number; max: number; step: number; fmt: (v: number) => string }
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'choice'; key: keyof Settings; label: string; options: Choice[]; reload?: boolean }
  | { kind: 'keys' }
  | { kind: 'report'; label: string; button: string };
interface Group {
  title: string;
  rows: Row[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function tabsFor(t: PanelText, c: PanelContext): { id: string; label: string; groups: Group[] }[] {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const onOff: Choice[] = [[true, t.on], [false, t.off]];
  void onOff;
  return [
    {
      id: 'graphics',
      label: t.tabGraphics,
      groups: [
        {
          title: t.gRender,
          rows: [
            { kind: 'choice', key: 'renderer', label: t.renderer, reload: true, options: [['webgl', 'WebGL2'], ['webgpu', 'WebGPU']] },
            { kind: 'choice', key: 'aa', label: t.aa, reload: true, options: [['off', t.off], ['msaa', 'MSAA'], ['smaa', 'SMAA']] },
            { kind: 'slider', key: 'scale', label: t.scale, min: 0.5, max: 1, step: 0.05, fmt: pct },
            { kind: 'toggle', key: 'autoScale', label: t.autoScale },
            { kind: 'choice', key: 'fpsCap', label: t.fpsCap, options: [[0, t.unlimited], [30, '30'], [60, '60'], [120, '120']] },
            { kind: 'choice', key: 'texture', label: t.texture, reload: true, options: [[0, t.low], [1, t.high]] },
            { kind: 'choice', key: 'shadows', label: t.shadows, options: [[0, t.off], [1, t.low], [2, t.high]] },
          ],
        },
        {
          title: t.gLight,
          rows: [
            { kind: 'choice', key: 'time', label: t.time, options: [['day', t.day], ['night', t.night], ['cycle', t.cycle]] },
            { kind: 'toggle', key: 'dynLights', label: t.dynLights },
            { kind: 'toggle', key: 'bounce', label: t.bounce },
            { kind: 'toggle', key: 'weather', label: t.weather },
          ],
        },
        {
          title: t.gFx,
          rows: [
            { kind: 'choice', key: 'particles', label: t.particles, options: [[0, t.low], [1, t.normal], [2, t.high]] },
            { kind: 'choice', key: 'gore', label: t.gore, options: [[0, t.low], [1, t.normal], [2, t.extra]] },
            { kind: 'choice', key: 'corpseTime', label: t.corpses, options: [[0, t.short], [1, t.normal], [2, t.long]] },
            { kind: 'slider', key: 'shake', label: t.shake, min: 0, max: 1.5, step: 0.1, fmt: pct },
            { kind: 'toggle', key: 'showFps', label: t.showFps },
            { kind: 'report', label: t.reportLabel, button: t.reportButton },
          ],
        },
      ],
    },
    {
      id: 'audio',
      label: t.tabAudio,
      groups: [
        {
          title: t.gMix,
          rows: [
            { kind: 'slider', key: 'volume', label: t.volume, min: 0, max: 1, step: 0.05, fmt: pct },
            { kind: 'slider', key: 'music', label: t.music, min: 0, max: 1, step: 0.05, fmt: pct },
            { kind: 'slider', key: 'sfxVolume', label: t.sfx, min: 0, max: 1, step: 0.05, fmt: pct },
            { kind: 'slider', key: 'voiceVolume', label: t.voices, min: 0, max: 1, step: 0.05, fmt: pct },
            { kind: 'toggle', key: 'uiSounds', label: t.uiSounds },
          ],
        },
      ],
    },
    {
      id: 'game',
      label: t.tabGame,
      groups: [
        {
          title: t.gFeel,
          rows: [
            { kind: 'toggle', key: 'autoAim', label: t.autoAim },
            { kind: 'toggle', key: 'hitStop', label: t.hitStop },
          ],
        },
        {
          title: t.gHud,
          rows: [
            { kind: 'toggle', key: 'damageNumbers', label: t.damageNumbers },
            { kind: 'toggle', key: 'announcer', label: t.announcer },
            { kind: 'toggle', key: 'ammoRing', label: t.ammoRing },
            { kind: 'toggle', key: 'nameTags', label: t.nameTags },
            { kind: 'toggle', key: 'minimap', label: t.minimap },
          ],
        },
      ],
    },
    {
      id: 'access',
      label: t.tabAccess,
      groups: [
        { title: t.gLang, rows: [{ kind: 'choice', key: 'lang', label: t.language, options: c.langs.map((l) => [l.id, l.label] as Choice) }] },
        {
          title: t.gLook,
          rows: [
            { kind: 'toggle', key: 'colorblind', label: t.colorblind },
            { kind: 'choice', key: 'textSize', label: t.textSize, options: [[0, 'A'], [1, 'A+'], [2, 'A++']] },
          ],
        },
      ],
    },
    { id: 'keys', label: t.tabKeys, groups: [{ title: t.tabKeys, rows: [{ kind: 'keys' }] }] },
  ];
}

/** Build the settings window into `host` (replacing what is there). */
export function renderSettingsPanel(host: HTMLElement, c: PanelContext): void {
  const t = panelText(c.lang);
  const tabs = tabsFor(t, c);
  const active = tabs.find((x) => x.id === c.tab) ?? tabs[0]!;
  host.innerHTML = '';
  const overlay = el('div', 'wrh-set');
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) c.onClose();
  });
  const panel = el('div', 'wrh-set-panel');
  const head = el('div', 'wrh-set-head');
  head.append(el('h2', undefined, t.settings));
  const x = el('button', 'wrh-set-x', '×');
  x.type = 'button';
  x.title = t.close;
  x.onclick = () => c.onClose();
  head.append(x);
  const bar = el('div', 'wrh-set-tabs');
  for (const tab of tabs) {
    const b = el('button', tab.id === active.id ? 'on' : '', tab.label);
    b.type = 'button';
    b.onclick = () => c.onTab(tab.id);
    bar.append(b);
  }
  const body = el('div', 'wrh-set-body');
  for (const g of active.groups) {
    body.append(el('div', 'wrh-set-group', g.title));
    for (const r of g.rows) body.append(buildRow(r, t, c));
  }
  const foot = el('div', 'wrh-set-foot');
  const ctl = el('button', undefined, `⌨ ${t.controls}`);
  ctl.type = 'button';
  ctl.onclick = () => c.onControls();
  const reset = el('button', undefined, t.reset);
  reset.type = 'button';
  reset.onclick = () => c.onReset();
  const close = el('button', 'primary', t.close);
  close.type = 'button';
  close.onclick = () => c.onClose();
  foot.append(ctl, reset, close);
  panel.append(head, bar, body, foot);
  overlay.append(panel);
  host.append(overlay);
  body.scrollTop = c.scroll;
  body.addEventListener('scroll', () => (c.scroll = body.scrollTop));
}

function buildRow(r: Row, t: PanelText, c: PanelContext): HTMLElement {
  const s = c.settings as unknown as Record<string, unknown>;
  if (r.kind === 'keys') {
    const wrap = el('div', 'wrh-set-keys');
    wrap.append(el('p', 'wrh-set-note', t.keysHint));
    const grid = el('div', 'wrh-set-keygrid');
    for (const a of c.actions) {
      grid.append(el('span', undefined, c.actionNames[a] ?? a));
      const b = el('button', 'wrh-set-keybtn');
      b.type = 'button';
      (c.bindings[a] ?? []).forEach((code, i) => {
        if (i) b.append(document.createTextNode(' '));
        b.append(keycap(keyLabel(code)));
      });
      b.onclick = () => c.onRebind(a);
      grid.append(b);
    }
    const reset = el('button', 'wrh-set-small', t.resetKeys);
    reset.type = 'button';
    reset.onclick = () => c.onResetKeys();
    wrap.append(grid, reset);
    return wrap;
  }
  const row = el('div', 'wrh-set-row');
  const label = el('label', undefined, r.label);
  row.append(label);
  if (r.kind === 'report') {
    const b = el('button', 'wrh-set-small', r.button);
    b.type = 'button';
    b.onclick = () => c.onReport();
    row.append(b);
  } else if (r.kind === 'toggle') {
    const sw = el('button', `wrh-switch${s[r.key] ? ' on' : ''}`);
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(!!s[r.key]));
    sw.append(el('i'));
    sw.onclick = () => c.onSetting(r.key, !s[r.key]);
    row.append(sw);
  } else if (r.kind === 'slider') {
    const input = el('input', 'wrh-range');
    input.type = 'range';
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    input.value = String(s[r.key]);
    const val = el('span', 'wrh-set-val', r.fmt(Number(s[r.key])));
    input.oninput = () => (val.textContent = r.fmt(Number(input.value)));
    input.onchange = () => c.onSetting(r.key, Number(input.value));
    row.append(input, val);
  } else {
    const seg = el('div', 'wrh-seg');
    for (const [value, text] of r.options) {
      const b = el('button', s[r.key] === value ? 'on' : '', text);
      b.type = 'button';
      b.onclick = () => c.onSetting(r.key, value as number | string | boolean);
      seg.append(b);
    }
    row.append(seg);
    if (r.reload) {
      label.title = t.reloads;
      label.append(el('small', undefined, ' ↻'));
    }
  }
  return row;
}

/** A keyboard key drawn as a keycap. */
function keycap(text: string, wide = false): HTMLElement {
  const k = el('kbd', `wrh-key${wide || text.length > 2 ? ' wide' : ''}`, text);
  return k;
}

const MOUSE_SVG = (left: boolean, right: boolean, wheel = false): string =>
  `<svg class="wrh-mouse" viewBox="0 0 40 56" width="34" height="48" aria-hidden="true"><rect x="3" y="3" width="34" height="50" rx="17" fill="#fffdf8" stroke="#3a352d" stroke-width="2.5"/><path d="M3 24h34M20 3v21" stroke="#3a352d" stroke-width="2" fill="none"/><path d="M20 3h0A17 17 0 0 0 3 20v4h17z" fill="${left ? '#1fa2ff' : 'none'}" opacity=".85"/><path d="M20 3h0a17 17 0 0 1 17 17v4H20z" fill="${right ? '#1fa2ff' : 'none'}" opacity=".85"/><rect x="17.5" y="9" width="5" height="9" rx="2.5" fill="${wheel ? '#1fa2ff' : '#cdbfa5'}"/></svg>`;

/** The controls sheet: every control with keycaps and what it does. */
export function renderControlsSheet(host: HTMLElement, c: Pick<PanelContext, 'lang' | 'bindings' | 'onClose' | 'onSetting'>): void {
  const t = panelText(c.lang);
  const b = (a: string): string[] => c.bindings[a] ?? [];
  host.innerHTML = '';
  const overlay = el('div', 'wrh-set');
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) c.onClose();
  });
  const panel = el('div', 'wrh-set-panel wide');
  const head = el('div', 'wrh-set-head');
  head.append(el('h2', undefined, `⌨ ${t.ctlTitle}`));
  const x = el('button', 'wrh-set-x', '×');
  x.type = 'button';
  x.onclick = () => c.onClose();
  head.append(x);
  const body = el('div', 'wrh-set-body');

  const caps = (codes: string[]): HTMLElement => {
    const d = el('span', 'wrh-keys-row');
    codes.forEach((code, i) => {
      if (i) d.append(el('em', undefined, '/'));
      d.append(keycap(keyLabel(code)));
    });
    return d;
  };
  const line = (keys: HTMLElement | string, title: string, tip: string): HTMLElement => {
    const r = el('div', 'wrh-ctl-row');
    const k = el('div', 'wrh-ctl-keys');
    if (typeof keys === 'string') k.innerHTML = keys;
    else k.append(keys);
    const d = el('div', 'wrh-ctl-desc');
    d.append(el('b', undefined, title), el('span', undefined, tip));
    r.append(k, d);
    return r;
  };
  const mouseLine = (svg: string, label: string, title: string, tip: string): HTMLElement => {
    const wrap = el('span', 'wrh-ctl-mouse');
    wrap.innerHTML = `${svg}<small>${label}</small>`;
    return line(wrap, title, tip);
  };

  body.append(el('div', 'wrh-set-group', t.secKeyboard));
  const move = el('span', 'wrh-keys-row');
  ['up', 'left', 'down', 'right'].forEach((a) => move.append(keycap(keyLabel(b(a)[0] ?? ''))));
  body.append(line(move, t.ctlMove, t.ctlMoveTip));
  body.append(mouseLine(MOUSE_SVG(false, false, true), t.mouseMove, t.ctlAim, t.ctlAimTip));
  const fire = el('span', 'wrh-ctl-mouse');
  fire.innerHTML = `${MOUSE_SVG(true, false)}<small>${t.mouseLeft}</small>`;
  fire.append(el('em', undefined, '/'), caps(b('fire')));
  body.append(line(fire, t.ctlFire, t.ctlFireTip));
  const gren = el('span', 'wrh-ctl-mouse');
  gren.innerHTML = `${MOUSE_SVG(false, true)}<small>${t.mouseRight}</small>`;
  gren.append(el('em', undefined, '/'), caps(b('grenade')));
  body.append(line(gren, t.ctlGrenade, t.ctlGrenadeTip));
  body.append(line(caps(b('reload')), t.ctlReload, t.ctlReloadTip));
  const pick = el('span', 'wrh-ctl-mouse');
  pick.innerHTML = `${MOUSE_SVG(true, false)}<small>${t.mouseLeft}</small>`;
  body.append(line(pick, t.ctlWeapons, t.ctlWeaponsTip));
  body.append(line(caps(b('dash')), t.ctlDash, t.ctlDashTip));
  body.append(line(caps(b('special')), t.ctlSpecial, t.ctlSpecialTip));
  body.append(line(caps(b('revive')), t.ctlRevive, t.ctlReviveTip));
  const cards = el('span', 'wrh-keys-row');
  ['card1', 'card2', 'card3'].forEach((a) => cards.append(keycap(keyLabel(b(a)[0] ?? ''))));
  body.append(line(cards, t.ctlCards, t.ctlCardsTip));
  body.append(line(caps(b('hostpause')), t.ctlHostPause, t.ctlHostPauseTip));
  body.append(line(caps(b('pause')), t.ctlPause, t.ctlPauseTip));

  body.append(el('div', 'wrh-set-group', t.secPad));
  const pad = el('div', 'wrh-padgrid');
  for (const text of [t.padMove, t.padAim, t.padFire, t.padGrenade, t.padReload, t.padDash, t.padRevive, t.padSwitch, t.padCards, t.padPause]) {
    const [btn, ...rest] = text.split(': ');
    const cell = el('div', 'wrh-padcell');
    cell.append(el('kbd', 'wrh-key pad', btn!), el('span', undefined, rest.join(': ')));
    pad.append(cell);
  }
  body.append(pad);

  const foot = el('div', 'wrh-set-foot');
  const close = el('button', 'primary', t.close);
  close.type = 'button';
  close.onclick = () => c.onClose();
  foot.append(close);
  panel.append(head, body, foot);
  overlay.append(panel);
  host.append(overlay);
}
