import { PERK, PERKS, STAT, STATS, WEAPON_IDS, WEAPON_SLOTS, MAX_PLAYERS } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** What the client alone knows about a run (the simulation never sees a mouse). */
export interface RunExtras {
  clicks: number;
  keys: number;
  bestCombo: number;
}

interface Row {
  id: string;
  icon: string;
  value: number;
  /** Text shown after counting up. */
  text: (v: number) => string;
  /** Rare or impressive: shown in gold. */
  hot?: boolean;
  /** A line that is not a number (the favourite weapon): shown at once. */
  raw?: string;
}

const L: Record<string, Record<string, string>> = {
  en: {
    title: 'What the run looked like',
    skip: 'click to skip',
    squad: 'Squad',
    reached: 'Floor reached',
    kills: 'Kills',
    time: 'Time alive',
    damage: 'Damage dealt',
    taken: 'Damage taken',
    healed: 'Health regained',
    maxhit: 'Biggest hit',
    crits: 'Critical hits',
    shots: 'Shots fired',
    hits: 'Hits landed',
    swings: 'Swings',
    grenades: 'Grenades thrown',
    barrels: 'Barrels blown up',
    revives: 'Friends revived',
    pickups: 'Pickups collected',
    dashes: 'Dashes',
    abilities: 'Abilities used',
    distance: 'Distance run',
    boss: 'Bosses killed',
    downs: 'Times downed',
    dps: 'Average damage per second',
    kpm: 'Kills per minute',
    weapon: 'Favourite weapon',
    clicks: 'Mouse clicks',
    keys: 'Keys pressed',
    combo: 'Longest combo',
    m: 'm',
    s: 's',
    taunt0: 'They counted everything.',
    taunt1: 'Wait, they tracked THAT too?!',
    taunt2: 'Even the clicks.',
  },
  tr: {
    title: 'Oyun nasıl geçti',
    skip: 'geçmek için tıkla',
    squad: 'Takım',
    reached: 'Ulaşılan kat',
    kills: 'Öldürme',
    time: 'Hayatta kalma süresi',
    damage: 'Verilen hasar',
    taken: 'Alınan hasar',
    healed: 'Geri kazanılan can',
    maxhit: 'En büyük vuruş',
    crits: 'Kritik vuruş',
    shots: 'Atılan mermi',
    hits: 'İsabet eden vuruş',
    swings: 'Savurma',
    grenades: 'Atılan bomba',
    barrels: 'Patlatılan varil',
    revives: 'Kurtarılan arkadaş',
    pickups: 'Toplanan eşya',
    dashes: 'Atılma',
    abilities: 'Kullanılan yetenek',
    distance: 'Koşulan mesafe',
    boss: 'Öldürülen patron',
    downs: 'Yere düşme',
    dps: 'Saniye başına ortalama hasar',
    kpm: 'Dakikada öldürme',
    weapon: 'En sevilen silah',
    clicks: 'Fare tıklaması',
    keys: 'Basılan tuş',
    combo: 'En uzun seri',
    m: 'm',
    s: 'sn',
    taunt0: 'Her şeyi saymışlar.',
    taunt1: 'Dur, bunu bile mi tutmuşlar?!',
    taunt2: 'Tıklamaları bile.',
  },
};

/** Small flat icons (24 x 24), drawn here so they are crisp at any size and take the colour of the card. */
const ICON: Record<string, string> = {
  reached: '<path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z"/>',
  kills: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8zm-3 9a1.6 1.6 0 1 1 0-3.2A1.6 1.6 0 0 1 9 12zm6 0a1.6 1.6 0 1 1 0-3.2A1.6 1.6 0 0 1 15 12zM10 20v-2h1.4v2zm2.6 0v-2H14v2z"/>',
  time: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 9.6-4-2.3.8-1.4 3.2 1.8V6h1.6z"/>',
  damage: '<path d="m12 2 2.2 6.3L21 9l-5 4.2 1.6 6.6L12 16l-5.6 3.8L8 13.2 3 9l6.8-.7z"/>',
  taken: '<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/>',
  healed: '<path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z"/>',
  maxhit: '<path d="M13 2 4 14h6l-1 8 10-13h-6z"/>',
  crits: '<path d="m12 1 3 7 7.5.6-5.7 5 1.8 7.4L12 17l-6.6 4 1.8-7.4-5.7-5L9 8z"/>',
  shots: '<path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
  hits: '<path d="M11 2h2v5h-2zm0 15h2v5h-2zM2 11h5v2H2zm15 0h5v2h-5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
  swings: '<path d="M20 3 9 14l-1-1-4 4 3 3 4-4-1-1L21 4zM6 17l1 1-2 2-1-1z"/>',
  grenades: '<path d="M13 3h4v2h-2l-1 2.1A7 7 0 1 1 5 14a7 7 0 0 1 6-6.9L12 4z"/>',
  barrels: '<path d="M7 3h10l2 4v10l-2 4H7l-2-4V7zm0 5v2h10V8zm0 6v2h10v-2z"/>',
  revives: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  pickups: '<path d="M6 8h12l2 13H4zm3-1a3 3 0 0 1 6 0z"/>',
  dashes: '<path d="m4 5 7 7-7 7V5zm9 0 7 7-7 7V5z"/>',
  abilities: '<path d="m12 2 1.8 4.6L18 4.5l-1.2 4.8L22 11l-4.6 1.8L19 18l-4.6-1.6L12 22l-2.4-5.6L5 18l1.6-5.2L2 11l5.2-1.7L6 4.5l4.2 2.1z"/>',
  distance: '<path d="M4 18c2 0 3-1 4-3l1-3c1-2 2-3 4-3h7v3h-5c-1 0-1.6.6-2 1.7l-.8 2.6C11.5 18.6 9.6 21 7 21H4z"/>',
  boss: '<path d="m3 18 1.5-10 4.6 4.5L12 5l2.9 7.5L19.5 8 21 18z"/>',
  downs: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-1 4h2v6.2l2.3-2.3 1.4 1.4L12 17.6l-4.7-4.3 1.4-1.4 2.3 2.3z"/>',
  dps: '<path d="M3 17 9 11l4 4 8-8v4h2V4h-7v2h3.6L13 12.6l-4-4L1.6 15.6z"/>',
  kpm: '<path d="M5 3h14v3H5zm1 5h12l-1 13H7zm3 2v9h2v-9zm4 0v9h2v-9z"/>',
  clicks: '<path d="M7 2h10a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm4 2v6H6V5a1 1 0 0 1 1-1zm2 0h4a1 1 0 0 1 1 1v5h-5z"/>',
  keys: '<path d="M3 6h18v12H3zm3 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h1V9zM6 13v2h12v-2z"/>',
  combo: '<path d="M13 1s1 4-2 7c-2 2-5 4-5 8a6 6 0 0 0 12 0c0-2-1-3-2-4 0 2-1 3-2 3 1-4 0-9-1-14z"/>',
};

const fmt = (v: number): string => Math.round(v).toLocaleString();

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] ?? ICON.damage}</svg>`;
}

/** The rows of one player's page. */
function rowsFor(world: World, s: number, lang: string, ex: RunExtras & { slot: number }, weaponName: (id: number) => string): Row[] {
  const t = L[lang] ?? L.en!;
  const st = (id: number): number => world.pStat[s * STATS + id]!;
  const perk = (id: number): number => world.pPerk[s * PERKS + id]!;
  const secs = st(STAT.AliveTicks) / 30;
  let fav = -1;
  let favT = 0;
  for (let k = 0; k < WEAPON_IDS.length; k++) {
    const v = world.pWpnTime[s * WEAPON_SLOTS + k]!;
    if (v > favT) {
      favT = v;
      fav = k;
    }
  }
  const dmg = perk(PERK.Damage);
  const kills = perk(PERK.Kills);
  const mins = Math.max(1 / 6, secs / 60);
  const time = (v: number): string => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  const rows: Row[] = [
    { id: 'reached', icon: 'reached', value: world.wave, text: fmt, hot: world.wave >= 20 },
    { id: 'kills', icon: 'kills', value: kills, text: fmt, hot: kills >= 400 },
    { id: 'time', icon: 'time', value: secs, text: time },
    { id: 'damage', icon: 'damage', value: dmg, text: fmt, hot: dmg >= 20000 },
    { id: 'maxhit', icon: 'maxhit', value: st(STAT.MaxHit), text: fmt, hot: st(STAT.MaxHit) >= 300 },
    { id: 'crits', icon: 'crits', value: st(STAT.Crits), text: fmt },
    { id: 'dps', icon: 'dps', value: dmg / Math.max(1, secs), text: fmt },
    { id: 'kpm', icon: 'kpm', value: kills / mins, text: fmt },
    { id: 'taken', icon: 'taken', value: st(STAT.DamageTaken), text: fmt },
    { id: 'healed', icon: 'healed', value: st(STAT.Healed), text: fmt },
    { id: 'shots', icon: 'shots', value: st(STAT.Shots), text: fmt },
    { id: 'hits', icon: 'hits', value: st(STAT.Hits), text: fmt },
    { id: 'swings', icon: 'swings', value: st(STAT.Swings), text: fmt },
    { id: 'grenades', icon: 'grenades', value: st(STAT.Grenades), text: fmt },
    { id: 'barrels', icon: 'barrels', value: st(STAT.Barrels), text: fmt },
    { id: 'revives', icon: 'revives', value: st(STAT.Revives), text: fmt, hot: st(STAT.Revives) >= 3 },
    { id: 'downs', icon: 'downs', value: st(STAT.Downs), text: fmt },
    { id: 'pickups', icon: 'pickups', value: st(STAT.Pickups), text: fmt },
    { id: 'dashes', icon: 'dashes', value: st(STAT.Dashes), text: fmt },
    { id: 'abilities', icon: 'abilities', value: st(STAT.Abilities), text: fmt },
    { id: 'boss', icon: 'boss', value: st(STAT.BossKills), text: fmt, hot: st(STAT.BossKills) >= 3 },
    { id: 'distance', icon: 'distance', value: st(STAT.Distance), text: (v) => `${fmt(v)} ${t.m}` },
  ];
  if (fav >= 0) rows.push({ id: 'weapon', icon: 'shots', value: 0, text: fmt, raw: weaponName(fav) });
  if (s === ex.slot) {
    rows.push({ id: 'combo', icon: 'combo', value: ex.bestCombo, text: (v) => `x${fmt(v)}`, hot: ex.bestCombo >= 25 });
    rows.push({ id: 'clicks', icon: 'clicks', value: ex.clicks, text: fmt });
    rows.push({ id: 'keys', icon: 'keys', value: ex.keys, text: fmt });
  }
  // a stat of zero is still shown (a run without a single revive says something), but the empty ones come last
  const head = rows.slice(0, 3);
  const rest = rows.slice(3);
  rest.sort((a, b) => Number(a.value === 0 && a.raw === undefined) - Number(b.value === 0 && b.raw === undefined));
  return [...head, ...rest.map((r) => ({ ...r }))];
}

export interface GameOverEnv {
  world: World;
  screen: HTMLElement;
  lang: string;
  slot: number;
  playerNames: string[];
  slotColor: (s: number) => string;
  weaponName: (id: number) => string;
  /** Title, record lines and the buttons (html from the UI); the stats go between them. */
  head: string;
  foot: string;
  /** A short tick sound for every revealed card. */
  tick: (i: number, last: boolean) => void;
  /** Show it all at once (a redraw, a language change). */
  instant?: boolean;
  extras: RunExtras & { slot: number };
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The game-over page: a head, a card for every statistic of one player (tabs choose the player in a squad) that appear one
 * after the other with a tick and a count-up, and the buttons. A click anywhere (or a key) shows everything at once.
 */
export function renderGameOver(env: GameOverEnv, who = env.slot): { stop: () => void } {
  const t = L[env.lang] ?? L.en!;
  const players: number[] = [];
  for (let s = 0; s < MAX_PLAYERS; s++) if (env.world.pActive[s]) players.push(s);
  let timers: number[] = [];
  let skipped = !!env.instant;
  const stop = (): void => {
    for (const id of timers) clearTimeout(id);
    timers = [];
  };
  const build = (player: number, animate: boolean): void => {
    stop();
    const rows = rowsFor(env.world, player, env.lang, env.extras, env.weaponName);
    const tabs =
      players.length > 1
        ? `<div class="wrh-go-tabs">${players.map((p) => `<button type="button" class="wrh-go-tab${p === player ? ' on' : ''}" data-p="${p}" style="--c:${env.slotColor(p)}">${esc(env.playerNames[p] ?? 'P' + (p + 1))}</button>`).join('')}</div>`
        : '';
    const cards = rows
      .map((r) => {
        const val = r.raw !== undefined ? `<span class="v">${esc(r.raw)}</span>` : `<span class="v" data-v="${r.value}" data-id="${r.id}">${animate ? '0' : r.text(r.value)}</span>`;
        return `<div class="wrh-go-card${r.hot ? ' hot' : ''}${animate ? '' : ' in'}" data-id="${r.id}"><i>${icon(r.icon)}</i><b>${esc(t[r.id] ?? r.id)}</b>${val}</div>`;
      })
      .join('');
    const taunt = t[`taunt${rows.length % 3}`] ?? '';
    env.screen.innerHTML = `<div class="wrh-panel wrh-center wrh-go" style="text-align:center">${env.head}${tabs}<div class="wrh-go-title">${esc(t.title ?? '')}</div><div class="wrh-go-grid" id="wrh-go-grid">${cards}</div><div class="wrh-go-taunt">${esc(taunt)}</div><div class="wrh-go-skip" id="wrh-go-skip">${esc(t.skip ?? '')}</div>${env.foot}</div>`;
    env.screen.querySelectorAll<HTMLElement>('.wrh-go-tab').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        skipped = true;
        build(Number(b.dataset.p), false);
      };
    });
    const skipEl = env.screen.querySelector<HTMLElement>('#wrh-go-skip');
    const showAll = (): void => {
      stop();
      skipped = true;
      env.screen.querySelectorAll<HTMLElement>('.wrh-go-card').forEach((c) => c.classList.add('in'));
      env.screen.querySelectorAll<HTMLElement>('.v[data-v]').forEach((v) => {
        const r = rows.find((x) => x.id === v.dataset.id);
        if (r) v.textContent = r.text(r.value);
      });
      skipEl?.classList.add('gone');
    };
    if (!animate || skipped) {
      showAll();
      return;
    }
    env.screen.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      showAll();
    };
    // one card at a time: it pops in, its number counts up, a tick sounds; the cards speed up as the list goes on
    let at = 450;
    rows.forEach((r, i) => {
      const card = env.screen.querySelector<HTMLElement>(`.wrh-go-card[data-id="${r.id}"]`);
      if (!card) return;
      timers.push(
        window.setTimeout(() => {
          card.classList.add('in');
          env.tick(i, i === rows.length - 1);
          const el = card.querySelector<HTMLElement>('.v[data-v]');
          if (!el) return;
          const t0 = performance.now();
          const dur = 520;
          const step = (): void => {
            const k = Math.min(1, (performance.now() - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            el.textContent = r.text(r.value * e);
            if (k < 1 && card.isConnected) requestAnimationFrame(step);
            else el.textContent = r.text(r.value);
          };
          requestAnimationFrame(step);
        }, at),
      );
      at += Math.max(110, 260 - i * 7);
    });
    timers.push(window.setTimeout(() => skipEl?.classList.add('gone'), at + 300));
  };
  build(who, !env.instant);
  return { stop };
}
