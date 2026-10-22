import { Difficulty, MODS } from '@wrh/shared';
import { asset } from './assets';
import type { Lang } from './ui';

/** The difficulty multipliers: the 20-card grid (menu, lobby), the one-line summary and the score of a run. */
interface Words {
  title: string;
  summary: string;
  none: string;
  score: string;
  close: string;
  hint: string;
  chosen: string;
  all: string;
  clear: string;
  base: string;
  final: string;
}

const W: Record<string, Words> = {
  en: {
    title: 'Difficulty multipliers',
    summary: 'Difficulty',
    none: 'None chosen: the normal game',
    score: 'Score multiplier',
    close: 'Done',
    hint: 'Every multiplier makes the game harder and raises your final score. The host chooses for everybody.',
    chosen: 'chosen',
    all: 'All',
    clear: 'Clear',
    base: 'Base score',
    final: 'Final score',
  },
  tr: {
    title: 'Zorluk çarpanları',
    summary: 'Zorluk',
    none: 'Seçili yok: normal oyun',
    score: 'Skor çarpanı',
    close: 'Tamam',
    hint: 'Her çarpan oyunu zorlaştırır ve final skorunu yükseltir. Herkes için host seçer.',
    chosen: 'seçili',
    all: 'Hepsi',
    clear: 'Temizle',
    base: 'Taban skor',
    final: 'Final skor',
  },
};

export const modWords = (lang: Lang): Words => W[lang] ?? W.en!;

export const MODS_CSS = `
.wrh-modsbtn{display:flex;align-items:center;gap:10px;width:100%;margin:4px 0 12px;padding:8px 12px;border-radius:12px;background:#efe7d6;color:#3a352d;border:3px solid #d9cdb4;text-align:left;cursor:pointer;font-weight:700}
.wrh-modsbtn:hover{border-color:#d8362e;background:#fff}
.wrh-modsbtn .strip{display:flex;gap:3px;flex:1;min-width:0;overflow:hidden}
.wrh-modsbtn .strip img{width:26px;height:26px;border-radius:6px;flex:none}
.wrh-modsbtn .txt{flex:1;font-size:13px;opacity:.75}
.wrh-modsbtn b{font-size:18px;color:#d8362e;font-variant-numeric:tabular-nums}
.wrh-modal{position:fixed;inset:0;z-index:60;background:rgba(20,28,44,.72);display:flex;align-items:center;justify-content:center;padding:16px}
.wrh-modpanel{width:min(920px,96vw);max-height:94vh;overflow:auto;background:#fbf6ea;border-radius:18px;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.4);color:#2b3a52}
.wrh-modpanel h2{margin:0 0 4px;font-size:24px}
.wrh-modpanel .hint{margin:0 0 12px;font-size:13px;opacity:.7}
.wrh-modgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.wrh-mod{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px 8px;border-radius:14px;background:#efe7d6;border:3px solid #d9cdb4;color:#3a352d;cursor:pointer;font-weight:800;font-size:13px;text-align:center;box-shadow:none;margin:0}
.wrh-mod img{width:64px;height:64px}
.wrh-mod.on{background:#fff;border-color:#d8362e;box-shadow:0 0 0 3px rgba(216,54,46,.22)}
.wrh-mod.on::after{content:'\\2713';position:absolute;top:6px;right:8px;color:#d8362e;font-size:18px}
.wrh-mod[aria-disabled=true]{cursor:default}
.wrh-mod .tip{display:none;position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);width:200px;padding:8px 10px;border-radius:10px;background:#2b3a52;color:#fff;font-size:12px;font-weight:600;z-index:3;pointer-events:none}
.wrh-mod:hover .tip,.wrh-mod:focus-visible .tip{display:block}
.wrh-modfoot{display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}
.wrh-modfoot .mult{flex:1;font-size:18px;font-weight:800}
.wrh-modfoot .mult b{color:#d8362e;font-size:26px;font-variant-numeric:tabular-nums}
.wrh-modfoot button{margin:0}
`;

/** The name and the sentence of a multiplier. */
export function modText(lang: Lang, i: number): readonly [string, string] {
  return MODS[i]!.text[lang] ?? MODS[i]!.text.en;
}

export const modIcon = (i: number): string => asset(`mods/${MODS[i]!.id}.webp`);

export function multText(mods: number): string {
  return `×${Difficulty.scoreMultiplier(mods).toFixed(2)}`;
}

/** The one-line summary button: the chosen icons and the score multiplier. */
export function modsRow(lang: Lang, mods: number, editable: boolean): string {
  const t = modWords(lang);
  const icons = Difficulty.indices(mods).map((i) => `<img src="${modIcon(i)}" alt="">`);
  const body = icons.length ? `<span class="strip">${icons.join('')}</span>` : `<span class="txt">${t.none}</span>`;
  return `<button type="button" class="wrh-modsbtn" id="wrh-mods-open" data-ed="${editable ? 1 : 0}">${body}<b>${multText(mods)}</b></button>`;
}

/** "3 chosen · ×1.35" or "None chosen: the normal game" (the Difficulty card of the main menu). */
export function modsSummary(lang: Lang, mods: number): string {
  const t = modWords(lang);
  const n = Difficulty.count(mods);
  return n ? `${n} ${t.chosen} · ${multText(mods)}` : t.none;
}

/** Up to three of the chosen icons (or the first one, faded, when none is chosen) for the Difficulty card. */
export function modsCardIcon(mods: number): string {
  const on = Difficulty.indices(mods).slice(0, 3);
  if (!on.length) return `<img src="${modIcon(0)}" alt="" style="opacity:.45;filter:grayscale(.6)">`;
  return `<span class="strip">${on.map((i) => `<img src="${modIcon(i)}" alt="">`).join('')}</span>`;
}

/** The grid of every multiplier, a toggle each with its sentence on hover. `page` draws it inside the Difficulty page (no title, no Done button). */
export function modsPanel(lang: Lang, mods: number, editable: boolean, page = false, locked = 0): string {
  const t = modWords(lang);
  const cards = MODS.map((_, i) => {
    const [name, text] = modText(lang, i);
    const on = Difficulty.indices(mods).includes(i);
    return `<button type="button" class="wrh-mod${on ? ' on' : ''}" data-mod="${i}" aria-pressed="${on ? 'true' : 'false'}"${editable ? '' : ' aria-disabled="true"'}${(locked >> i) & 1 ? ' disabled data-locked="1"' : ''}><img src="${modIcon(i)}" alt=""><span>${name}</span><span class="tip">${text}</span></button>`;
  }).join('');
  const tools = editable ? `<button type="button" class="alt" id="wrh-mods-all">${t.all}</button><button type="button" class="alt" id="wrh-mods-none">${t.clear}</button>` : '';
  const done = page ? '' : `<button type="button" id="wrh-mods-close">${t.close}</button>`;
  return `<div class="wrh-modpanel">${page ? '' : `<h2>${t.title}</h2>`}<p class="hint">${t.hint}</p><div class="wrh-modgrid">${cards}</div><div class="wrh-modfoot"><span class="mult">${t.score}: <b id="wrh-mods-mult">${multText(mods)}</b></span>${tools}${done}</div></div>`;
}
