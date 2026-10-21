import { ACHIEVEMENTS, type AchievementDef } from '@wrh/shared';
import { achIcon, achName, achWords, fmtNum, howTo, isGot, lockedIcon, valueOf } from './achievements';
import type { AchStore } from './profile';
import type { Lang } from './ui';

export const ACH_CSS = `
.wrh-badge{position:absolute;top:-6px;right:-6px;min-width:24px;height:24px;border-radius:12px;background:#e5302a;color:#fff;font:900 16px/24px system-ui,sans-serif;text-align:center;font-style:normal;box-shadow:0 2px 6px rgba(0,0,0,.35);animation:wrhbadge 1.2s ease-in-out infinite alternate}
@keyframes wrhbadge{from{transform:scale(1)}to{transform:scale(1.15)}}
#wrh-open-ach{position:relative}
.wrh-ach{position:fixed;inset:0;z-index:70;background:linear-gradient(180deg,#fbf6ea,#efe4cc);overflow:auto;padding:clamp(14px,3vh,34px) clamp(14px,4vw,64px);color:#2b3a52}
.wrh-ach button,.wrh-modfoot button{padding:9px 22px;border-radius:11px;border:0;background:#1fa2ff;color:#fff;font:800 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 0 #0f78c4}
.wrh-modfoot button.alt{background:#8b97ab;box-shadow:0 3px 0 #66718a}
.wrh-ach h1{margin:0 0 4px;font-size:clamp(26px,4vw,38px)}
.wrh-ach .top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.wrh-ach .top .count{font-weight:800;font-size:18px;flex:1}
.wrh-ach .top button{margin:0}
.wrh-achgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.wrh-achc{position:relative;display:grid;grid-template-columns:64px 1fr;gap:4px 12px;align-items:center;padding:12px;border-radius:14px;background:#fffaf0;border:3px solid #e4d9c3;box-shadow:0 2px 6px rgba(20,28,44,.1)}
.wrh-achc.got{border-color:#e9b92f;background:#fff8dc}
.wrh-achc img{grid-row:1 / 3;width:64px;height:64px}
.wrh-achc:not(.got) img{filter:grayscale(.85) brightness(.9);opacity:.8}
.wrh-achc b{font-size:15px;line-height:1.15;align-self:end}
.wrh-achc .bar{height:10px;border-radius:5px;background:#e4d9c3;overflow:hidden;align-self:start;position:relative}
.wrh-achc .bar i{display:block;height:100%;background:linear-gradient(90deg,#47b86a,#7ccf8a)}
.wrh-achc.got .bar i{background:linear-gradient(90deg,#e9b92f,#ffd54a)}
.wrh-achc .num{grid-column:2;font-size:12px;font-weight:700;opacity:.75;font-variant-numeric:tabular-nums}
.wrh-achc .tip{display:none;position:absolute;left:8px;right:8px;bottom:calc(100% + 6px);padding:8px 10px;border-radius:10px;background:#2b3a52;color:#fff;font-size:13px;font-weight:600;z-index:4;pointer-events:none}
.wrh-achc:hover .tip{display:block}
.wrh-goach{margin:14px 0 2px;text-align:left}
.wrh-goach h3{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.wrh-goach .list{display:flex;flex-wrap:wrap;gap:8px}
.wrh-goach .one{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:12px;background:#fff8dc;border:2px solid #e9b92f;font-weight:800;font-size:14px;animation:wrh-go-pop .38s cubic-bezier(.2,1.5,.4,1)}
.wrh-goach .one img{width:40px;height:40px}
`;

/** The full-screen page: every achievement with its icon, progress bar and (on hover) how to get it. */
export function achPage(lang: Lang, store: AchStore): string {
  const w = achWords(lang);
  const got = ACHIEVEMENTS.filter((a) => isGot(a, store)).length;
  const cards = ACHIEVEMENTS.map((a) => card(a, lang, store)).join('');
  return `<div class="top"><h1>${w.title}</h1><span class="count">${got} / ${ACHIEVEMENTS.length} ${w.earned}</span><button type="button" id="wrh-ach-close">${w.close}</button></div><div class="wrh-achgrid">${cards}</div>`;
}

function card(a: AchievementDef, lang: Lang, store: AchStore): string {
  const w = achWords(lang);
  const done = isGot(a, store);
  if (a.hidden && !done) {
    return `<div class="wrh-achc" data-id="${a.id}"><img src="${lockedIcon()}" alt=""><b>${w.hidden}</b><div class="bar"><i style="width:0"></i></div><span class="num">&nbsp;</span><span class="tip">${w.hiddenText}</span></div>`;
  }
  const value = valueOf(a, store);
  const frac = a.kind === 'flag' ? (done ? 1 : 0) : Math.min(1, value / a.target);
  const num = a.kind === 'flag' ? (done ? w.done : '') : `${fmtNum(Math.min(value, a.target), lang)} / ${fmtNum(a.target, lang)}`;
  return `<div class="wrh-achc${done ? ' got' : ''}" data-id="${a.id}"><img src="${achIcon(a)}" alt=""><b>${achName(a, lang)}</b><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div><span class="num">${num}</span><span class="tip">${howTo(a, lang)}</span></div>`;
}

/** The achievements a run earned, for the game over screen (below the statistics). */
export function runAchievementsHtml(lang: Lang, earned: readonly AchievementDef[]): string {
  if (earned.length === 0) return '';
  const w = achWords(lang);
  const items = earned.map((a) => `<span class="one"><img src="${achIcon(a)}" alt="">${achName(a, lang)}</span>`).join('');
  return `<div class="wrh-goach"><h3>${w.runTitle}</h3><div class="list">${items}</div></div>`;
}
