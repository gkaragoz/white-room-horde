import { CARD_IDS, CARD_PACKS, CLASS_IDS, DRONE_TYPES, ELITE_NAMES, ENEMY_TYPES, MAPS, MODS, PLAYER_COLORS, WEAPON_IDS, xpForLevel, MAX_LEVEL, type TrackItem } from '@wrh/shared';
import { arenaThumb } from './arenaThumb';
import { asset } from './assets';
import { CODEX_CATEGORIES, codexHas, type CodexCategory, type Discovery } from './codex';
import { esc } from './htmlUtil';
import { icon } from './icons';
import { CATALOG_TOTAL, catalog, catalogFound, isOpen, levelOf, rewardsBetween, unlockLevelOf } from './meta';
import { fill, metaWords, type MetaWords } from './metaStrings';
import { modIcon, modText } from './modsUi';
import { ACCESSORIES, type Profile } from './profile';
import type { Lang, StringSet } from './uiStrings';

/** How a thing looks in a tile: its picture (HTML) and its name. */
export interface View {
  img: string;
  name: string;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const pic = (src: string): string => `<img src="${src}" alt="" draggable="false">`;
const bySlot = (t: StringSet): Record<string, string> => t.weapons as Record<string, string>;

/** The picture and the name of a Codex entry. */
export function entryView(cat: CodexCategory, index: number, t: StringSet, lang: Lang): View {
  const w = metaWords(lang);
  switch (cat) {
    case 'weapon': {
      const id = WEAPON_IDS[index]!;
      return { img: pic(asset(`ui/wpn_${id}.png`)), name: bySlot(t)[id] ?? id };
    }
    case 'drone':
      return { img: icon(`drone_${index}`, 56), name: (t.droneNames as readonly string[])[index] ?? DRONE_TYPES[index]! };
    case 'card': {
      const id = CARD_IDS[index]!;
      return { img: pic(asset(`cards/${id}.png`)), name: (t.cards as Record<string, readonly [string, string]>)[id]?.[0] ?? id };
    }
    case 'class':
      return { img: icon(`class_${index}`, 56), name: (t.classNames as readonly string[])[index] ?? CLASS_IDS[index]! };
    case 'arena':
      return { img: typeof document === 'undefined' ? '' : pic(arenaThumb(index)), name: (t.maps as Record<string, string>)[String(index)] ?? MAPS[index]!.id };
    case 'powerup':
      return { img: icon('hud_star', 56), name: (t.powerups as readonly string[])[index] ?? '' };
    case 'elite':
      return { img: icon('hud_skull', 56), name: (t.elites as readonly string[])[index] ?? ELITE_NAMES[index] ?? '' };
    case 'enemy':
      return { img: icon('hud_skull', 56), name: cap(ENEMY_TYPES[index] ?? '') };
    case 'boss':
      return { img: icon('go_boss', 56), name: `${w.tabs.boss} ${index}` };
  }
}

/** The picture and the name of something a level opens. */
export function trackView(item: TrackItem, t: StringSet, lang: Lang): View {
  const w = metaWords(lang);
  switch (item.cat) {
    case 'weapon':
      return entryView('weapon', WEAPON_IDS.indexOf(item.name as (typeof WEAPON_IDS)[number]), t, lang);
    case 'drone':
      return entryView('drone', DRONE_TYPES.indexOf(item.name as (typeof DRONE_TYPES)[number]), t, lang);
    case 'arena':
      return entryView('arena', MAPS.findIndex((m) => m.id === item.name), t, lang);
    case 'class':
      return entryView('class', CLASS_IDS.indexOf(item.name as (typeof CLASS_IDS)[number]), t, lang);
    case 'powerup':
      return entryView('powerup', ({ shield: 4, haste: 5, quad: 6, nuke: 7, freeze: 8 } as Record<string, number>)[item.name] ?? 4, t, lang);
    case 'elite':
      return entryView('elite', ELITE_NAMES.indexOf(item.name as (typeof ELITE_NAMES)[number]), t, lang);
    case 'mod': {
      const i = MODS.findIndex((m) => m.id === item.name);
      return { img: pic(modIcon(i)), name: modText(lang, i)[0] };
    }
    case 'pack': {
      const cards = CARD_PACKS[item.name];
      return { img: cards ? pic(asset(`cards/${cards[0]}.png`)) : icon('hud_star', 56), name: `${w.pack} · ${fill(w.packCards, { n: cards?.length ?? 0 })}` };
    }
    case 'cosmetic': {
      const acc = ACCESSORIES.indexOf(`acc_${item.name}` as (typeof ACCESSORIES)[number]);
      if (acc >= 0) return { img: icon('hud_star', 56), name: `${w.look}: ${(t.accs as readonly string[])[acc] ?? item.name}` };
      const n = Number(item.name.replace('renk ', ''));
      const hex = PLAYER_COLORS[n - 1] ?? '#888';
      return { img: `<span class="wrh-swatch" style="background:${hex}"></span>`, name: fill(w.color, { n }) };
    }
  }
}

/** The level path of the hub: where the player is, the XP to the next level and what the next levels open. */
export function levelPathHtml(p: Profile, t: StringSet, lang: Lang): string {
  const w = metaWords(lang);
  const level = levelOf(p);
  const top = level >= MAX_LEVEL;
  const from = xpForLevel(level);
  const to = top ? from : xpForLevel(level + 1);
  const frac = top ? 1 : Math.max(0, Math.min(1, (p.xp - from) / Math.max(1, to - from)));
  const first = Math.max(1, Math.min(level - 1, MAX_LEVEL - 5));
  const nodes: string[] = [];
  for (let l = first; l <= Math.min(MAX_LEVEL, first + 5); l++) {
    const state = l < level ? 'done' : l === level ? 'now' : 'next';
    const items = state === 'next' ? rewardsBetween(l - 1, l) : [];
    const list = items.map((i) => `<li>${esc(trackView(i, t, lang).name)}</li>`).join('');
    nodes.push(`<li class="wrh-node ${state}"><span class="dot">${l}</span>${list ? `<ul class="rw">${list}</ul>` : ''}</li>`);
  }
  const line = top ? w.xpMax : fill(w.xpToNext, { n: to - p.xp, l: level + 1 });
  return `<section class="wrh-path" aria-label="${esc(w.path)}">
    <div class="wrh-path-head"><b>${esc(w.level)} ${level}${top ? ` · ${esc(w.max)}` : ''}</b><span class="xp"><i style="width:${(frac * 100).toFixed(1)}%"></i></span><small>${esc(line)}</small></div>
    <ol class="wrh-nodes">${nodes.join('')}</ol>
  </section>`;
}

/** The hub card line of the Codex: "14 / 132 discovered". */
export function codexSub(p: Profile, lang: Lang): string {
  return fill(metaWords(lang).codexSub, { a: catalogFound(p.codex), b: CATALOG_TOTAL });
}

/** The Codex page: a tab per category and a tile for every entry (met, opened but not met, or locked). */
export function codexPageHtml(p: Profile, tab: CodexCategory, t: StringSet, lang: Lang): string {
  const w = metaWords(lang);
  const tabs = CODEX_CATEGORIES.map((c) => {
    const list = catalog(c);
    const n = list.filter((i) => codexHas(p.codex, c, i)).length;
    return `<button type="button" class="wrh-ctab${c === tab ? ' on' : ''}" data-ctab="${c}">${esc(w.tabs[c])} <small>${n}/${list.length}</small></button>`;
  }).join('');
  const tiles = catalog(tab)
    .map((i) => {
      const view = entryView(tab, i, t, lang);
      const met = codexHas(p.codex, tab, i);
      const open = isOpen(p, tab, i);
      const at = unlockLevelOf(tab, i);
      const nw = p.seenNew.includes(`${tab}:${trackNameOf(tab, i)}`);
      const num = String(i + 1).padStart(3, '0');
      if (met) return `<div class="wrh-tile met"><span class="num">#${num}</span>${nw ? `<em>${esc(w.noteNew)}</em>` : ''}<span class="im">${view.img}</span><b>${esc(view.name)}</b></div>`;
      if (open) return `<div class="wrh-tile open"><span class="num">#${num}</span>${nw ? `<em>${esc(w.noteNew)}</em>` : ''}<span class="im">${view.img}</span><b>${esc(view.name)}</b><small>${esc(w.openedUnmet)}</small></div>`;
      const label = at === 'ach' ? w.lockedAch : at === null ? w.lockedMeet : fill(w.lockedLevel, { n: at });
      const tip = at === 'ach' ? w.lockedAchTip : at === null ? w.lockedMeet : fill(w.lockedTip, { n: at });
      return `<div class="wrh-tile locked" title="${esc(tip)}"><span class="num">#${num}</span><span class="im">${view.img}</span><b>???</b><small>${esc(label)}</small></div>`;
    })
    .join('');
  return `<div class="wrh-ctabs">${tabs}</div><div class="wrh-tiles">${tiles}</div>`;
}

/** The `seenNew` name of a Codex entry (the track's `cat:name` key), where the track has one. */
function trackNameOf(cat: CodexCategory, index: number): string {
  switch (cat) {
    case 'weapon':
      return `${WEAPON_IDS[index]}`;
    case 'drone':
      return `${DRONE_TYPES[index]}`;
    case 'class':
      return `${CLASS_IDS[index]}`;
    case 'arena':
      return `${MAPS[index]?.id}`;
    case 'elite':
      return `${ELITE_NAMES[index]}`;
    default:
      return '';
  }
}


export interface PackState {
  /** Indices of the packs the player has opened already. */
  opened: ReadonlySet<number>;
}

/** The game over panel: XP gained, the level and the reward packs of the levels reached (face down until opened). */
export function runRewardHtml(
  meta: { xp: number; levelBefore: number; levelAfter: number; rewards: TrackItem[]; discoveries: Discovery[] },
  state: PackState,
  t: StringSet,
  lang: Lang,
  seconds: number,
): string {
  const w = metaWords(lang);
  const up = meta.levelAfter > meta.levelBefore;
  const head = up ? fill(w.levelUp, { a: meta.levelBefore, b: meta.levelAfter }) : fill(w.noLevelUp, { a: meta.levelAfter });
  const xp = meta.xp > 0 ? fill(w.xpGain, { n: meta.xp }) : seconds < 15 ? w.xpNone : fill(w.xpGain, { n: 0 });
  const packs = meta.rewards.map((r, i) => {
    const v = trackView(r, t, lang);
    const open = state.opened.has(i);
    return `<button type="button" class="wrh-pack${open ? ' open' : ''}" data-pack="${i}" aria-label="${esc(open ? v.name : w.packTap)}"><span class="back">?</span><span class="face"><span class="im">${v.img}</span><b>${esc(v.name)}</b></span></button>`;
  });
  const left = meta.rewards.filter((_, i) => !state.opened.has(i)).length;
  const found = meta.discoveries.map((d) => esc(entryView(d.cat, d.index, t, lang).name)).join(', ');
  return `<section class="wrh-reward">
    <div class="wrh-rw-head"><b>${esc(head)}</b><span class="gain">${esc(xp)}</span></div>
    ${packs.length ? `<div class="wrh-packs">${packs.join('')}</div>${left > 1 ? `<button type="button" class="wrh-openall" id="wrh-openall">${esc(w.openAll)}</button>` : ''}` : up ? '' : `<p class="wrh-rw-none">${esc(w.rewardsNone)}</p>`}
    ${found ? `<p class="wrh-rw-found"><b>${esc(w.added)}:</b> ${found}</p>` : ''}
  </section>`;
}

/** The corner card shown in a run when something is met for the first time. */
export function cornerCardHtml(d: Discovery, number: number, total: number, t: StringSet, lang: Lang): string {
  const w = metaWords(lang);
  const v = entryView(d.cat, d.index, t, lang);
  return `<span class="im">${v.img}</span><span class="tx"><small>${esc(w.cornerAdded)}</small><b>${esc(v.name)}</b><small>#${String(number).padStart(3, '0')} · ${number}/${total}</small></span>`;
}

/** Show a corner card at the bottom left of the page for a few seconds (cards queue up). */
export function showCornerCard(host: HTMLElement, html: string, ms = 3200): void {
  let box = host.querySelector<HTMLElement>('.wrh-corner');
  if (!box) {
    box = document.createElement('div');
    box.className = 'wrh-corner';
    box.setAttribute('role', 'status');
    host.appendChild(box);
  }
  const card = document.createElement('div');
  card.className = 'wrh-ccard';
  card.innerHTML = html;
  box.appendChild(card);
  requestAnimationFrame(() => card.classList.add('in'));
  setTimeout(() => {
    card.classList.remove('in');
    setTimeout(() => card.remove(), 400);
  }, ms);
  while (box.children.length > 3) box.firstElementChild?.remove();
}

/** The one-time note for a player whose old save was moved to the new system. */
export function introHtml(lang: Lang): string {
  const w: MetaWords = metaWords(lang);
  return `<div class="wrh-modal wrh-intro" role="dialog" aria-modal="true"><div class="box"><h2>${esc(w.introTitle)}</h2><p>${esc(w.introBody)}</p><button type="button" id="wrh-intro-ok">${esc(w.introOk)}</button></div></div>`;
}

export const META_CSS = `
.wrh-path{margin:6px 0 12px;padding:12px 16px 14px;border-radius:22px;background:rgba(255,253,250,.82);box-shadow:0 8px 26px rgba(40,70,110,.14);color:#2b3a52}
.wrh-path-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.wrh-path-head b{font-size:clamp(18px,2.6vh,26px)}
.wrh-path-head .xp{flex:1 1 140px;min-width:120px;height:12px;border-radius:8px;background:rgba(43,58,82,.16);overflow:hidden}
.wrh-path-head .xp i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,#f0b43c,#e8862e)}
.wrh-path-head small{font-weight:700;opacity:.75}
.wrh-nodes{display:flex;gap:6px;list-style:none;margin:12px 0 0;padding:0;overflow-x:auto;align-items:flex-start}
.wrh-node{flex:1 0 92px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center}
.wrh-node .dot{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-weight:800;font-size:14px;background:rgba(43,58,82,.14);color:#516079}
.wrh-node.done .dot{background:#3aa56a;color:#fff}
.wrh-node.now .dot{width:46px;height:46px;font-size:19px;background:#f0b43c;color:#3b2a06;box-shadow:0 0 0 4px #fff,0 0 0 7px #e8862e}
.wrh-node .rw{list-style:none;margin:0;padding:0;font-size:12px;font-weight:700;color:#516079;overflow-wrap:anywhere}
.wrh-ctabs{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}
.wrh-ctab{padding:7px 12px;border-radius:14px;border:0;font-weight:800;background:rgba(43,58,82,.1);color:#2b3a52;cursor:pointer}
.wrh-ctab.on{background:#2b3a52;color:#fff}
.wrh-ctab small{opacity:.7;font-weight:700}
.wrh-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
.wrh-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;padding:26px 8px 10px;border-radius:16px;background:#fff;color:#2b3a52;text-align:center;min-height:128px;box-shadow:0 3px 10px rgba(40,70,110,.12);overflow:hidden}
.wrh-tile .num{position:absolute;top:6px;left:8px;font-size:11px;font-weight:800;opacity:.5}
.wrh-tile em{position:absolute;top:5px;right:6px;font-style:normal;font-size:11px;font-weight:800;color:#fff;background:#e8503e;border-radius:8px;padding:1px 6px}
.wrh-tile .im{display:grid;place-items:center;height:56px}
.wrh-tile .im img{max-width:72px;max-height:52px;object-fit:contain}
.wrh-tile b{font-size:13px;overflow-wrap:anywhere}
.wrh-tile small{font-size:11px;font-weight:700;opacity:.7}
.wrh-tile.met{outline:3px solid #f0b43c}
.wrh-tile.open{opacity:.62}
.wrh-tile.locked{background:rgba(43,58,82,.08);border:2px dashed rgba(43,58,82,.3);box-shadow:none}
.wrh-tile.locked .im{filter:brightness(0) opacity(.35)}
.wrh-swatch{display:inline-block;width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.3)}
.wrh-reward{margin:12px 0;padding:14px 16px;border-radius:20px;background:rgba(255,253,250,.92);color:#2b3a52;box-shadow:0 8px 26px rgba(0,0,0,.18)}
.wrh-rw-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:clamp(17px,2.4vh,24px)}
.wrh-rw-head .gain{font-weight:800;color:#d8862e}
.wrh-packs{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 6px;justify-content:center}
.wrh-pack{position:relative;width:112px;height:136px;padding:0;border:0;border-radius:16px;background:none;cursor:pointer;perspective:600px}
.wrh-pack .back,.wrh-pack .face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:16px;backface-visibility:hidden;transition:transform .45s}
.wrh-pack .back{background:linear-gradient(160deg,#3d5a86,#27395a);color:#f0b43c;font-size:44px;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.wrh-pack .face{background:#fff;transform:rotateY(180deg);outline:3px solid #f0b43c;padding:6px;font-size:12px}
.wrh-pack .face .im{display:grid;place-items:center;height:56px}
.wrh-pack .face img{max-width:72px;max-height:56px}
.wrh-pack.open .back{transform:rotateY(180deg)}
.wrh-pack.open .face{transform:rotateY(0)}
.wrh-openall{display:block;margin:6px auto 0;padding:8px 18px;border:0;border-radius:14px;font-weight:800;background:#2b3a52;color:#fff;cursor:pointer}
.wrh-rw-found,.wrh-rw-none{margin:8px 0 0;font-size:14px}
.wrh-corner{position:fixed;left:14px;bottom:14px;z-index:60;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.wrh-ccard{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:16px;background:rgba(255,253,250,.95);color:#2b3a52;box-shadow:0 6px 20px rgba(0,0,0,.28);transform:translateX(-120%);opacity:0;transition:transform .35s,opacity .35s;max-width:min(320px,80vw)}
.wrh-ccard.in{transform:none;opacity:1}
.wrh-ccard .im{display:grid;place-items:center;width:52px;height:52px;border-radius:12px;background:rgba(240,180,60,.25)}
.wrh-ccard .im img{max-width:44px;max-height:44px}
.wrh-ccard .tx{display:flex;flex-direction:column;min-width:0}
.wrh-ccard small{font-size:11px;font-weight:700;opacity:.7}
.wrh-ccard b{font-size:15px;overflow-wrap:anywhere}
.wrh-class.locked,.wrh-sw.locked,.wrh-arena.locked,.wrh-mod[data-locked]{opacity:.4;filter:grayscale(1);cursor:not-allowed}
@media (min-width:701px){.wrh-hubcards:has(#wrh-open-codex){grid-template-columns:repeat(5,minmax(0,1fr))}}
.wrh-codexpage{overflow:auto}
.wrh-intro{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(20,30,45,.55)}
.wrh-intro .box{max-width:min(440px,88vw);padding:22px;border-radius:20px;background:#fffdfa;color:#2b3a52;box-shadow:0 12px 40px rgba(0,0,0,.4)}
.wrh-intro button{margin-top:10px;padding:9px 22px;border:0;border-radius:14px;font-weight:800;background:#e8862e;color:#fff;cursor:pointer}
@media (prefers-reduced-motion:reduce){.wrh-pack .back,.wrh-pack .face,.wrh-ccard{transition:none}}
`;
