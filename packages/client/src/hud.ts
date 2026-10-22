import { viewOf } from './view/worldView';
import { esc } from './htmlUtil';
import { inventoryHtml } from './weaponHtml';
import { icon, chipIcon } from './icons';
import { droneNeed } from '@wrh/sim';
import { POWERS } from './render/power';
import { BALANCE, FloorPhase, MISC, CARD_IDS, CARD_RARITY, TEAM_CARDS, MAX_PLAYERS, PERK, PERKS, PlayerState, TICK_RATE, DRONE_TYPES, DRONE_MAX_LEVEL, DRONE_TIER_LEVELS } from '@wrh/shared';
import { modFx, xpForNext, type World } from '@wrh/sim';
import { asset } from './assets';
import { loadProfile } from './profile';
import type { UiHandlers } from './ui';
import type { Lang, StringSet } from './uiStrings';

/** What the HUD needs from the Ui that owns it. */
export interface HudHost {
  readonly root: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly screen: HTMLElement;
  readonly handlers: UiHandlers;
  /** The strings of the current language. */
  t(): StringSet;
  lang(): Lang;
  playerNames(): string[];
  slotColor(slot: number): string;
}

/**
 * The in-game HUD: top bar, squad cards, local player gear, relics, drone, boss bar, floor countdown, warnings and
 * banners. It is drawn from a World by `update` (about 12 times a second) and keeps what it needs between frames.
 */
export class Hud {
  constructor(private readonly host: HudHost) {
    this.el.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.infoEl.className = 'wrh-info';
    this.bindRelicTips();
  }

  readonly el = document.createElement('div');
  private hudBuilt = false;
  private lastCards = '';
  private lastHud = 0;
  private bannerUntil = 0;

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
    const t = this.host.t();
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
    this.tipEl.style.setProperty('--rc', this.host.slotColor(s));
    return (
      `<b>${esc(this.host.playerNames()[s] ?? 'P' + (s + 1))} &middot; ${esc(className)}</b><span>${esc(classTip)}</span>` +
      `<span>${t.lvShort} ${world.pLevel[s]} &middot; ${t.xpTip} ${Math.floor(world.pXp[s]!)}/${Math.floor(xpForNext(world, s))}</span>` +
      `<span>${t.killsTip}: ${Math.round(kills)} &middot; ${t.dmgTotal}: ${Math.round(dmg).toLocaleString()}</span>` +
      `<span>${t.avgDps}: ${Math.round(dmg / secs)}</span>`
    );
  }

  readonly relicEl = document.createElement('div');
  readonly tipEl = document.createElement('div');
  private lastRelics = '';

  /** The cards the local character took, as small icons bottom centre (stacked with a count); hover shows what each does. */
  private updateRelics(world: World, slot: number): void {
    const n = CARD_IDS.length;
    const counts: number[] = [];
    for (let i = 0; i < n; i++) counts.push(world.pCards[slot * n + i]!);
    const key = counts.join(',') + this.host.lang();
    if (key === this.lastRelics) return;
    this.lastRelics = key;
    const t = this.host.t();
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
    this.host.root.classList.toggle('has-relics', html !== '');
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
    this.el.addEventListener('mouseover', (e) => {
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
      if (!this.el.querySelector('#h-squad')?.contains(el)) return;
      this.hoverTip = null;
      this.squadTip = el.dataset.tip === 'chip' ? { kind: 'chip', slot: Number(el.dataset.s), k: Number(el.dataset.k) } : { kind: 'pc', slot: Number(el.dataset.s), k: 0 };
      if (this.lastWorld) this.tipEl.innerHTML = this.squadTipHtml(this.lastWorld);
      this.tipEl.style.display = 'block';
      place(e);
    });
    this.el.addEventListener('mousemove', (e) => {
      if ((this.squadTip || this.hoverTip) && this.tipEl.style.display === 'block') place(e);
    });
    this.el.addEventListener('mouseout', (e) => {
      const to = e.relatedTarget as HTMLElement | null;
      if ((this.squadTip || this.hoverTip) && !(to?.closest?.('[data-tip]') && this.el.contains(to))) {
        this.squadTip = null;
        this.hoverTip = null;
        this.tipEl.style.display = 'none';
      }
    });
    // the drone card: a click opens the list of drones, a click on one of them switches (and never fires a shot behind it)
    this.el.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('.wrh-drone [data-dt]');
      const card = target.closest<HTMLElement>('.wrh-drone .dr-card');
      if (!row && !card) return;
      e.preventDefault();
      e.stopPropagation();
      if (row) {
        this.host.handlers.onDrone?.(Number(row.dataset.dt));
        this.droneOpen = false;
      } else this.droneOpen = !this.droneOpen;
      this.hudHtml.delete('h-drone');
    });
    // the weapon list: a click picks the weapon, and never fires a shot behind it
    this.el.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.wrh-inv [data-w]');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      this.host.handlers.onSlot(Number(row.dataset.w));
    });
    // the round buttons at the top right say what they are in one word
    this.host.toolbar.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.wrh-tbtn');
      if (!b) return;
      const hint = (this.host.t().tbHint as Record<string, string>)[b.id.slice(3)] ?? '';
      this.squadTip = null;
      this.hoverTip = null;
      this.tipEl.style.setProperty('--rc', '#9aa5b4');
      this.tipEl.innerHTML = `<b>${esc(hint)}</b>`;
      this.tipEl.style.display = 'block';
      const r = b.getBoundingClientRect();
      this.tipEl.style.left = `${Math.max(6, Math.min(innerWidth - this.tipEl.offsetWidth - 6, r.right - this.tipEl.offsetWidth))}px`;
      this.tipEl.style.top = `${r.bottom + 8}px`;
    });
    this.host.toolbar.addEventListener('mouseout', (e) => {
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.wrh-tbtn')) this.tipEl.style.display = 'none';
    });
    // a locked weapon of the menu says what opens it
    const lockedAt = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest<HTMLElement>('.wrh-wp.locked[data-lock]');
    this.host.screen.addEventListener('mouseover', (e) => {
      const el = lockedAt(e);
      if (!el) return;
      const text = el.dataset.locktext ?? this.host.t().lockedFloor.replace('{n}', el.dataset.lock ?? '').replace('{m}', String(loadProfile().bestWave));
      this.squadTip = null;
      this.hoverTip = null;
      this.tipEl.style.setProperty('--rc', '#9aa5b4');
      this.tipEl.innerHTML = `<b>${esc(text)}</b>`;
      this.tipEl.style.display = 'block';
      const r = el.getBoundingClientRect();
      this.tipEl.style.left = `${Math.max(6, Math.min(innerWidth - this.tipEl.offsetWidth - 6, r.left + r.width / 2 - this.tipEl.offsetWidth / 2))}px`;
      this.tipEl.style.top = `${Math.max(6, r.top - this.tipEl.offsetHeight - 8)}px`;
    });
    this.host.screen.addEventListener('mouseout', (e) => {
      if (lockedAt(e) && !lockedAt({ target: e.relatedTarget } as unknown as Event)) this.tipEl.style.display = 'none';
    });
    this.relicEl.addEventListener('mouseover', (e) => {
      this.squadTip = null;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.wrh-relic');
      if (!el) return;
      const i = Number(el.dataset.i);
      const id = CARD_IDS[i]!;
      const t = this.host.t();
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
    const t = this.host.t();
    if (g === 'gren') return `<b>${esc(t.gearGren[0])}</b><span>${esc(t.gearGren[1])}</span>`;
    if (g === 'dash') return `<b>${esc(t.gearDash[0])}</b><span>${esc(t.gearDash[1])}</span>`;
    const tipTxt = (t.classTips as readonly string[])[this.gearInfo.cls] ?? '';
    return `<b>${esc(this.gearInfo.abName)}</b><span>${esc(tipTxt)}</span><em>${esc(t.gearAbility)}</em>`;
  }

  private lastRelicsCounts(i: number): number {
    return Number(this.lastRelics.split(',')[i] ?? 0) || 0;
  }

  readonly infoEl = document.createElement('div');
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
    el.innerHTML = `<div class="ic">${icon('hud_star', 24)}</div><div><b>${esc(item.title)}</b><span>${esc(item.detail)}</span><small>${this.host.t().infoBy}: ${esc(item.who)}</small></div>`;
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

  /** The ring around the player's feet: green when the magazine is full, red when it runs out, with the rounds left beside it. */
  /** Light text on the HUD while it is night. */
  setNightHud(on: boolean): void {
    this.host.root.classList.toggle('night', on);
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
    const t = this.host.t();
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
      this.host.root.appendChild(el);
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

  private buildHud(): void {
    this.hudHtml.clear();
    this.el.innerHTML = `
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
    this.host.root.classList.remove('has-relics');
    this.lastRelics = '';
    this.tipEl.style.display = 'none';
    this.el.innerHTML = '';
    this.hudHtml.clear();
    this.hudBuilt = false;
    this.lastCards = '';
  }

  warn(text: string): void {
    const el = this.el.querySelector<HTMLElement>('#h-warn');
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
      this.host.root.appendChild(el);
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
    const el = this.el.querySelector<HTMLElement>('#h-hostpause');
    if (!el) return;
    el.style.display = on ? 'block' : 'none';
    if (on) el.innerHTML = `${icon('hud_pause', 18)} ${this.host.t().hostPaused}${canResume ? `<small>${this.host.t().hostResume}</small>` : ''}`;
  }

  private readonly cineEl = document.createElement('div');
  private cineLabel = '';

  /** The finisher's look: letterbox bars, a vignette and the name of whoever landed the last blow. `k` is 0 (off) to 1. */
  setCine(k: number, who: string, color: string): void {
    const el = this.cineEl;
    if (!el.isConnected) {
      el.className = 'wrh-cine';
      el.innerHTML = '<i class="top"></i><i class="bot"></i><b></b>';
      this.host.root.appendChild(el);
    }
    this.host.root.classList.toggle('cine-on', k > 0.05);
    if (k <= 0.001) {
      if (el.style.display !== 'none') el.style.display = 'none';
      this.cineLabel = '';
      return;
    }
    el.style.display = 'block';
    el.style.setProperty('--k', k.toFixed(3));
    const label = who ? `${this.host.t().finalBlow}: ${who}` : this.host.t().finalBlow;
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
    this.host.root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
    setTimeout(() => el.remove(), ms + 100);
  }

  banner(text: string, sub = '', ms = 2200): void {
    const el = this.el.querySelector<HTMLElement>('#h-banner');
    if (!el) return;
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.style.display = 'block';
    this.bannerUntil = performance.now() + ms;
  }

  /** Update the HUD from the world (throttled to ~12 Hz; cheap DOM writes only). */
  update(world: World, slot: number, hurt: number, now: number, names: string[]): void {
    this.lastWorld = world;
    if (!this.hudBuilt) this.buildHud();
    const hurtEl = this.el.querySelector<HTMLElement>('#h-hurt')!;
    const wv = viewOf(world);
    const pulse = wv.lowHealth(slot) ? 0.22 + 0.18 * Math.sin(now / 180) : 0;
    hurtEl.style.opacity = String(Math.min(1, Math.max(hurt, pulse)));
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      this.el.querySelector<HTMLElement>('#h-banner')!.style.display = 'none';
    }
    if (now - this.lastHud < 80) return;
    this.lastHud = now;
    if (this.startNow < 0 || now < this.startNow) this.startNow = now;
    this.lastNow = now;
    const t = this.host.t();
    const set = (id: string, html: string): void => {
      // compare with what was written last time: the browser re-serialises innerHTML (entities become characters), so
      // reading it back never matches and every frame would rebuild the element (and eat a click on it)
      if (this.hudHtml.get(id) === html) return;
      const el = this.el.querySelector<HTMLElement>('#' + id)!;
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
    (this.el.querySelector('#h-xp') as HTMLElement).style.width = `${Math.min(100, (world.pXp[slot]! / xpForNext(world, slot)) * 100)}%`;

    // boss bar
    const boss = wv.bossIndex;
    const bb = this.el.querySelector<HTMLElement>('#h-bossbar')!;
    const bl = this.el.querySelector<HTMLElement>('#h-bosslabel')!;
    bb.style.display = bl.style.display = boss >= 0 ? 'block' : 'none';
    if (boss >= 0) {
      (this.el.querySelector('#h-boss') as HTMLElement).style.width = `${wv.bossHealthFraction * 100}%`;
      bl.textContent = t.boss;
    }

    // squad: one card per player with a smooth health bar (and its number), shield and the upgrades they carry
    let squad = '';
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s]) continue;
      const st = world.pState[s]!;
      const maxHp = world.pMaxHp[s]!;
      const frac = wv.healthFraction(s);
      const col = this.host.slotColor(s);
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
      set('h-inv', inventoryHtml(this.host.t(), world, slot));
      this.updateRelics(world, slot);
      const bar = this.el.querySelector<HTMLElement>('#h-reload')!;
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
    const lvlEl = this.el.querySelector<HTMLElement>('#h-lvl')!;
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
    const cardsEl = this.el.querySelector<HTMLElement>('#h-cards')!;
    if (world.pOffer[slot * 3]! >= 0 && !world.gameOver && world.pState[slot] === PlayerState.Alive) {
      const offer = [world.pOffer[slot * 3]!, world.pOffer[slot * 3 + 1]!, world.pOffer[slot * 3 + 2]!];
      const more = world.pPending[slot]!;
      const key = offer.join(',') + this.host.lang() + more;
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
          el.onclick = () => this.host.handlers.onCard(Number(el.dataset.i));
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

  /** Forget the card strip so the next `update` draws it again (settings or language changed). */
  resetCards(): void {
    this.lastCards = '';
  }

  /** Build the HUD again on the next `update` (language changed). */
  rebuild(): void {
    this.hudBuilt = false;
  }
}
