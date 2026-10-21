import { icon as icon2 } from './icons';
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
const fmt = (v: number): string => Math.round(v).toLocaleString();

function icon(name: string): string {
  return icon2(`go_${name}`, 26);
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
