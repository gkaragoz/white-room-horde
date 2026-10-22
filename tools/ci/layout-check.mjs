// Layout check: opens the menu pages, the settings, the HUD, the pause menu and the game over screen at several screen
// sizes, in every language and text size, and looks for what makes a page feel cramped or broken:
//   clipped   text cut off by its own box (overflow hidden) or wider than its box
//   truncated text shortened with an ellipsis
//   offscreen an element that sticks out of the window with no scroll to reach it
//   overlap   two separate elements drawn on top of each other
//   cramped   text closer than 3px to the edge of its own button, chip or card
//   touching  two buttons with less than 4px between them
//   small     a tap target below 32px on a touch-sized screen, or text below 10px
//
//   pnpm --filter @wrh/client build && node tools/ci/layout-check.mjs [--quick] [--only=menu,hud] [--json=file]
// It prints the findings grouped by kind, saves a screenshot of every scene that has some (LAYOUT_OUT, default the temp
// folder) and exits 1 when there are any, except in the kinds listed in KNOWN (accepted on purpose).
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const wide = args.includes('--wide');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const out = process.env.LAYOUT_OUT ?? join(tmpdir(), 'wrh-layout');
mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, p === '/' || p === String.fromCharCode(92) ? 'index.html' : p);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pick = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).split(',');
const ALL_SIZES = quick
  ? [['laptop', 1366, 768], ['phone', 390, 844]]
  : [['desktop', 1920, 1080], ['laptop', 1366, 768], ['small', 1024, 640], ['phone', 390, 844], ['phone-landscape', 844, 390]];
const LANGS = pick('langs') ?? (quick ? ['en', 'de'] : ['en', 'tr', 'de', 'es', 'fr', 'ru']);
const SIZES = ALL_SIZES.filter(([n]) => !pick('sizes') || pick('sizes').includes(n));
const TEXT_SIZES = quick ? [0] : [0, 2];

/** Kinds accepted on purpose (nothing for now): `kind` or `kind:selector-part`. */
const KNOWN = [];

// ---- the detector, run inside the page ---------------------------------------------------------------------------
function detector(rootSel) {
  const rootEl = document.querySelector(rootSel);
  const vw = innerWidth;
  const vh = innerHeight;
  const touch = vw < 800 || vh < 500;
  const found = [];
  if (!rootEl) return found;
  const short = (el) => {
    const parts = [];
    for (let e = el; e && e !== rootEl && parts.length < 3; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      else if (e.classList.length) s += '.' + [...e.classList].slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join('>');
  };
  const style = (el) => getComputedStyle(el);
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = style(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /** The part of the element that is not cut off by an ancestor that scrolls or clips. */
  const visibleRect = (el) => {
    const r = el.getBoundingClientRect();
    let l = r.left;
    let t = r.top;
    let rr = r.right;
    let b = r.bottom;
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = style(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = e.getBoundingClientRect();
      l = Math.max(l, c.left);
      t = Math.max(t, c.top);
      rr = Math.min(rr, c.right);
      b = Math.min(b, c.bottom);
    }
    return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
  };
  const scrollable = (el) => {
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = style(e);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) return true;
    }
    return false;
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const textRect = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rs = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  };
  const add = (kind, el, detail, other) => found.push({ kind, at: short(el), other: other ? short(other) : undefined, detail });

  const all = [...rootEl.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'BR', 'PATH', 'SVG', 'USE', 'DEFS', 'G', 'RECT', 'CIRCLE', 'LINE', 'POLYGON', 'TITLE'].includes(el.tagName.toUpperCase()) && shown(el));
  const interactive = (el) => el.matches('button, a[href], input, select, textarea, [role="button"], .wrh-card, .wrh-mod, .wrh-achc');

  for (const el of all) {
    const cs = style(el);
    const r = el.getBoundingClientRect();
    const text = ownText(el);
    // clipped / wider than its box
    if (text) {
      const hiddenX = /(hidden|clip)/.test(cs.overflowX);
      const hiddenY = /(hidden|clip)/.test(cs.overflowY);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) add('truncated', el, `${el.scrollWidth}px of text in ${el.clientWidth}px: "${el.textContent.trim().slice(0, 40)}"`);
      else if (hiddenX && el.scrollWidth > el.clientWidth + 1) add('clipped', el, `${el.scrollWidth}px of content in ${el.clientWidth}px (wide): "${el.textContent.trim().slice(0, 40)}"`);
      else if (hiddenY && el.scrollHeight > el.clientHeight + 1) add('clipped', el, `${el.scrollHeight}px of content in ${el.clientHeight}px (tall): "${el.textContent.trim().slice(0, 40)}"`);
      else if (!hiddenX && !/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && cs.display !== 'inline') add('clipped', el, `text spills ${el.scrollWidth - el.clientWidth}px past its box: "${el.textContent.trim().slice(0, 40)}"`);
      // text is cramped against the edge of its own box
      const hasBox = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
      if (hasBox && cs.display !== 'inline' && r.width > 12 && r.height > 12 && el.tagName !== 'KBD') {
        const tr = textRect(el);
        if (tr) {
          const inset = Math.min(tr.l - r.left, r.right - tr.r, tr.t - r.top, r.bottom - tr.b);
          const bw = Math.min(parseFloat(cs.borderLeftWidth), parseFloat(cs.borderTopWidth));
          if (inset - bw < 2.5 && inset > -1) add('cramped', el, `${(inset).toFixed(1)}px of room around "${el.textContent.trim().slice(0, 40)}"`);
        }
      }
      const fs = parseFloat(cs.fontSize);
      if (fs < 10) add('small', el, `text ${fs}px: "${el.textContent.trim().slice(0, 30)}"`);
    }
    // sticks out of the window with no way to scroll to it
    const outside = r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1;
    const anchored = el.matches('.wrh-tag, .wrh-plabel, .wrh-dmg, .wrh-ring, .wrh-ammo, .wrh-combo');
    if (outside && !anchored && (text || interactive(el) || el.tagName === 'IMG' || el.tagName === 'CANVAS') && !scrollable(el)) {
      add('offscreen', el, `${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh}`);
    }
    if (interactive(el) && touch && Math.min(r.width, r.height) < 30 && !el.matches('input[type="checkbox"], input[type="radio"]')) add('small', el, `tap target ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // overlap and touching: separate things drawn on top of each other
  // only what the player can actually see: the thing at its centre is itself (or part of it), not another page stacked over it
  const seen = (el) => {
    const r = visibleRect(el);
    if (r.width <= 0 || r.height <= 0) return false;
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  };
  const stuck = (el) => {
    for (let e = el; e && e !== rootEl; e = e.parentElement) if (/(sticky|fixed)/.test(style(e).position) && e !== rootEl && !e.matches('.wrh-ui, .wrh-home')) return true;
    return false;
  };
  const boxes = all.filter((el) => (interactive(el) || el.tagName === 'IMG' || el.tagName === 'CANVAS' || (ownText(el) && el.children.length === 0)) && style(el).pointerEvents !== 'none' && seen(el));
  const rects = boxes.map((el) => visibleRect(el));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.contains(b) || b.contains(a)) continue;
      // content scrolling under a sticky bar is how those bars work
      if (stuck(a) || stuck(b)) continue;
      const ra = rects[i];
      const rb = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 3 && h > 3) {
        // a thing and the text or image that is part of a sibling box it is stacked over on purpose (position absolute pairs) is still reported: look at it
        add('overlap', a, `${Math.round(w)}x${Math.round(h)}px shared with ${short(b)}`, b);
      } else if (interactive(a) && interactive(b) && a.parentElement === b.parentElement) {
        const gapX = Math.max(rb.left - ra.right, ra.left - rb.right);
        const gapY = Math.max(rb.top - ra.bottom, ra.top - rb.bottom);
        const rowish = h > Math.min(ra.height, rb.height) * 0.5;
        const colish = w > Math.min(ra.width, rb.width) * 0.5;
        if ((rowish && gapX >= 0 && gapX < 4) || (colish && gapY >= 0 && gapY < 4)) add('touching', a, `${Math.max(gapX, gapY).toFixed(1)}px from ${short(b)}`, b);
      }
    }
  }
  return found;
}

// ---- scenes ------------------------------------------------------------------------------------------------------
const results = [];
let scenes = 0;

const OLD_PROFILE = { bestWave: 12, bestKills: 640, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 };
/** A player part way along the Discovery Path: level 30, a few things met, something new waiting. */
const META_PROFILE = { ...OLD_PROFILE, v: 2, xp: 14000, introSeen: true, codex: { weapon: [0b110000011], drone: [8], class: [1], arena: [1], elite: [6], enemy: [3], boss: [2] }, seenNew: ['weapon:mp'] };

async function newPage(w, h, lang, textSize, query, profile = OLD_PROFILE) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  await ctx.addInitScript(([lang, textSize, profile]) => {
    try {
      localStorage.setItem('wrh.profile', JSON.stringify(profile));
      localStorage.setItem('wrh.lang', lang);
      localStorage.setItem('wrh.settings', JSON.stringify({ lang, textSize }));
      localStorage.setItem('wrh.notesSeen', '999.0');
    } catch {}
  }, [lang, textSize, profile]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/' + query);
  // --wide: text about 6% wider, as the fallback fonts of a Linux machine are, to catch boxes that only just fit
  if (wide) await page.addStyleTag({ content: '.wrh-ui,.wrh-ui *{letter-spacing:.06em !important}' });
  return { ctx, page, errors };
}

async function scan(page, scene, size, lang, textSize, sel = '.wrh-ui') {
  scenes++;
  const found = await page.evaluate(detector, sel);
  const key = `${scene}|${size}|${lang}|t${textSize}`;
  for (const f of found) results.push({ scene, size, lang, textSize, ...f });
  if (found.length) {
    const file = join(out, `${key.replace(/[|]/g, '_')}.png`);
    await page.screenshot({ path: file }).catch(() => undefined);
  }
  return found.length;
}

const wants = (name) => !only || only.includes(name);

/** The menu under the meta progression: the level path on the hub, the Codex page and the locked pickers. */
async function metaJob(size, w, h, lang, ts) {
  const { ctx, page } = await newPage(w, h, lang, ts, '?menu=1&meta=1', META_PROFILE);
  try {
    await page.waitForSelector('#wrh-open-codex', { timeout: 90000, state: 'attached' });
    await sleep(900);
    await scan(page, 'meta-hub', size, lang, ts);
    await page.click('#wrh-open-codex');
    await sleep(500);
    for (const tab of ['weapon', 'class', 'card', 'arena']) {
      await page.click(`[data-ctab="${tab}"]`);
      await sleep(250);
      await scan(page, `meta-codex-${tab}`, size, lang, ts);
    }
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.click('#wrh-open-loadout');
    await sleep(700);
    await scan(page, 'meta-loadout', size, lang, ts);
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.click('#wrh-card-mods');
    await sleep(300);
    await scan(page, 'meta-mods', size, lang, ts);
  } finally {
    await ctx.close();
  }
}

async function menuJob(size, w, h, lang, ts) {
  const { ctx, page } = await newPage(w, h, lang, ts, '?menu=1');
  try {
    await page.waitForSelector('#wrh-solo', { timeout: 90000, state: 'attached' });
    await sleep(900);
    await scan(page, 'menu-hub', size, lang, ts);
    for (const [name, card] of [['play', '#wrh-card-play'], ['loadout', '#wrh-open-loadout'], ['mods', '#wrh-card-mods']]) {
      await page.click(card);
      await sleep(name === 'mods' ? 300 : 700);
      await scan(page, `menu-${name}`, size, lang, ts);
      if (name === 'play') {
        const online = page.locator('#wrh-online');
        if (await online.count()) {
          await online.click().catch(() => undefined);
          await sleep(300);
          await scan(page, 'menu-play-online', size, lang, ts);
        }
      }
      await page.keyboard.press('Escape');
      await sleep(150);
      if ((await page.evaluate(() => document.querySelector('.wrh-home')?.dataset.page)) !== 'hub') await page.keyboard.press('Escape');
    }
    await page.click('#wrh-open-ach').catch(() => undefined);
    await sleep(500);
    await scan(page, 'achievements', size, lang, ts);
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.click('#wrh-open-settings').catch(() => undefined);
    await page.waitForSelector('.wrh-set-tabs', { timeout: 5000 }).catch(() => undefined);
    const tabs = await page.locator('.wrh-set-tabs button').count();
    for (let t = 0; t < tabs; t++) {
      await page.locator('.wrh-set-tabs button').nth(t).click();
      await sleep(250);
      await scan(page, `settings-${t}`, size, lang, ts);
    }
  } catch (e) {
    results.push({ scene: 'menu', size, lang, textSize: ts, kind: 'script', at: '', detail: String(e).slice(0, 200) });
  }
  await ctx.close();
}

async function hudJob(size, w, h, lang) {
  const ts = 0;
  const { ctx, page } = await newPage(w, h, lang, ts, '?solo=1&god=1&wave=5&map=0&bots=5');
  try {
    await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 60, null, { timeout: 120000 });
    await page.evaluate(() => {
      const w = window.__wrh.world;
      w.pOwned[0] = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 5);
    });
    await sleep(1500);
    await scan(page, 'hud', size, lang, ts);
    await page.keyboard.press('Escape');
    await sleep(500);
    await scan(page, 'pause', size, lang, ts);
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.evaluate(() => {
      window.__wrh.world.pHp[0] = 0;
    });
    await page.waitForFunction(() => window.__wrh.world.pState[0] === 1, null, { timeout: 20000 }).catch(() => undefined);
    await sleep(600);
    await scan(page, 'downed', size, lang, ts);
  } catch (e) {
    results.push({ scene: 'hud', size, lang, textSize: ts, kind: 'script', at: '', detail: String(e).slice(0, 200) });
  }
  await ctx.close();
}

const retrying = (job) => async () => {
  const before = results.length;
  await job();
  if (results.slice(before).some((r) => r.kind === 'script')) {
    results.length = before;
    await job();
  }
};
const queue = [];
for (const [size, w, h] of SIZES) {
  for (const lang of LANGS) {
    if (wants('menu')) for (const ts of TEXT_SIZES) queue.push(retrying(() => menuJob(size, w, h, lang, ts)));
    if (wants('meta')) for (const ts of TEXT_SIZES) queue.push(retrying(() => metaJob(size, w, h, lang, ts)));
    if (wants('hud') && (!quick || lang === 'en')) queue.push(retrying(() => hudJob(size, w, h, lang)));
  }
}
const WORKERS = Number(process.env.LAYOUT_WORKERS ?? 4);
await Promise.all(Array.from({ length: WORKERS }, async () => { for (let job = queue.shift(); job; job = queue.shift()) await job(); }));
await browser.close();
server.close();

// ---- report ------------------------------------------------------------------------------------------------------
const known = (r) => KNOWN.some((k) => (k.includes(':') ? r.kind === k.split(':')[0] && r.at.includes(k.split(':')[1]) : r.kind === k));
const bad = results.filter((r) => !known(r));
const groups = new Map();
for (const r of bad) {
  const key = `${r.kind}  ${r.at}${r.other ? '  vs  ' + r.other : ''}`;
  const g = groups.get(key) ?? { kind: r.kind, n: 0, where: new Set(), example: r.detail };
  g.n++;
  g.where.add(`${r.scene}/${r.size}/${r.lang}${r.textSize ? '/big' : ''}`);
  groups.set(key, g);
}
const sorted = [...groups.entries()].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || b[1].n - a[1].n);
console.log(`scanned ${scenes} scenes (${SIZES.length} sizes, ${LANGS.length} languages, ${TEXT_SIZES.length} text sizes); ${bad.length} findings in ${groups.size} places`);
const byKind = {};
for (const r of bad) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log('by kind:', JSON.stringify(byKind));
for (const [key, g] of sorted.slice(0, quick ? 40 : 80)) console.log(`${g.kind.toUpperCase().padEnd(9)} x${String(g.n).padEnd(3)} ${key.slice(10)}\n          e.g. ${g.example}\n          in ${[...g.where].slice(0, 4).join(', ')}${g.where.size > 4 ? ` (+${g.where.size - 4})` : ''}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(bad, null, 1));
console.log(bad.length ? `screenshots of the scenes with findings are in ${out}` : 'no layout findings');
process.exit(bad.length ? 1 : 0);
