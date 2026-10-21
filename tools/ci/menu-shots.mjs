// Screenshots of the main menu (the card hub and each of its full-screen pages) at desktop, laptop and phone sizes, plus layout
// checks: no horizontal overflow, every element id the rest of the game and the QA scripts rely on is there, each card opens its
// page and Back / Escape return to the hub, the online panel opens and closes, an invite link opens the Play page with the
// code filled in, the controls live only inside the settings, and the typed name survives a language change.
//
//   pnpm --filter @wrh/client build && node tools/ci/menu-shots.mjs
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const out = resolve(fileURLToPath(new URL('../blender/out/menu', import.meta.url)));
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
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
const IDS = ['wrh-solo', 'wrh-online', 'wrh-host', 'wrh-join', 'wrh-code', 'wrh-pass', 'wrh-server', 'wrh-name', 'wrh-weapons', 'wrh-class-tip', 'wrh-prev-host', 'wrh-prev-name', 'wrh-prev-stats', 'wrh-open-settings', 'wrh-open-ach', 'wrh-open-loadout', 'wrh-card-play', 'wrh-card-mods', 'tb-lang', 'tb-set'];
const PAGES = [['play', '#wrh-card-play'], ['loadout', '#wrh-open-loadout'], ['mods', '#wrh-card-mods']];
const SIZES = [
  ['desktop', 1920, 1080],
  ['laptop', 1366, 768],
  ['phone', 390, 844],
  ['phone-landscape', 844, 390],
];

async function open(w, h, query = '?menu=1') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 12, bestKills: 640, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
      localStorage.setItem('wrh.lang', 'en');
      localStorage.setItem('wrh.notesSeen', '999.0');
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  await page.goto(base + '/' + query);
  await page.waitForSelector('#wrh-solo', { timeout: 90000, state: 'attached' });
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}

try {
  for (const [label, w, h] of SIZES) {
    const { ctx, page, errors } = await open(w, h);
    await page.screenshot({ path: join(out, `menu_${label}.png`) });
    const info = await page.evaluate((ids) => {
      const home = document.querySelector('.wrh-home');
      const r = home.getBoundingClientRect();
      return {
        missing: ids.filter((id) => !document.getElementById(id)),
        fullscreen: r.width >= innerWidth - 1 && r.height >= innerHeight - 1,
        overflowX: home.scrollWidth - home.clientWidth,
        classes: document.querySelectorAll('.wrh-class[data-cls]').length,
        emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(home.innerText),
        playBox: document.getElementById('wrh-card-play').getBoundingClientRect().toJSON(),
        oldControls: !!document.getElementById('tb-ctl') || /WASD/.test(home.innerText),
        broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(-40)),
      };
    }, IDS);
    check(`${label}: all element ids present`, info.missing.length === 0, info.missing.join(','));
    check(`${label}: fills the screen`, info.fullscreen);
    check(`${label}: no horizontal overflow`, info.overflowX <= 1, `${info.overflowX}px`);
    check(`${label}: nine classes`, info.classes === 9);
    check(`${label}: no emoji left in the menu text`, !info.emoji);
    check(`${label}: no broken images`, info.broken.length === 0, info.broken.join(','));
    check(`${label}: no separate controls button or hint line`, !info.oldControls);
    if (w < 800) check(`${label}: the play button is a touch target`, info.playBox.height >= 44 && info.playBox.width >= 120, `${Math.round(info.playBox.width)}x${Math.round(info.playBox.height)}`);
    // every card opens its page, the page fits the width, Back and Escape return to the hub
    for (const [name, card] of PAGES) {
      await page.click(card);
      await page.waitForTimeout(name === 'mods' ? 300 : 900);
      const shown = await page.evaluate((n) => {
        const home = document.querySelector('.wrh-home');
        const pg = home.querySelector(`[data-p="${n}"]`);
        const r = pg.getBoundingClientRect();
        return { page: home.dataset.page, visible: getComputedStyle(pg).display !== 'none' && r.height > 100, overflowX: home.scrollWidth - home.clientWidth };
      }, name);
      check(`${label}: the ${name} card opens its page`, shown.page === name && shown.visible);
      check(`${label}: the ${name} page has no horizontal overflow`, shown.overflowX <= 1, `${shown.overflowX}px`);
      await page.screenshot({ path: join(out, `menu_${label}_${name}.png`) });
      if (name === 'play') {
        const canvas = await page.evaluate(() => { const c = document.querySelector('#wrh-stagebox canvas, [data-slot="play"] canvas'); const r = c?.getBoundingClientRect(); return r ? { w: r.width, h: r.height, inPlay: !!document.querySelector('[data-slot="play"] canvas') } : null; });
        check(`${label}: the 3D character is on the Play page`, !!canvas && canvas.inPlay && canvas.w > 120, JSON.stringify(canvas));
      }
      if (name === 'mods') {
        const grid = await page.locator('#wrh-mods-page .wrh-mod').count();
        check(`${label}: the difficulty page shows the 20 multipliers`, grid === 20, String(grid));
      }
      await page.click(`[data-p="${name}"] .wrh-back`);
      check(`${label}: Back returns to the hub (${name})`, (await page.evaluate(() => document.querySelector('.wrh-home').dataset.page)) === 'hub');
      await page.click(card);
      await page.keyboard.press('Escape');
      check(`${label}: Escape returns to the hub (${name})`, (await page.evaluate(() => document.querySelector('.wrh-home').dataset.page)) === 'hub');
    }
    // the settings: a page of their own with the controls inside
    await page.click('#wrh-open-settings');
    await page.waitForSelector('.wrh-set-tabs');
    await page.screenshot({ path: join(out, `menu_${label}_settings.png`) });
    await page.click('.wrh-set-tabs button:last-child');
    check(`${label}: the controls are a tab of the settings`, (await page.locator('.wrh-ctl-row').count()) > 8);
    await page.screenshot({ path: join(out, `menu_${label}_controls.png`) });
    await page.keyboard.press('Escape');
    check(`${label}: Escape closes the settings`, (await page.locator('.wrh-set-tabs').count()) === 0);
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // the online panel
  {
    const { ctx, page } = await open(1366, 768);
    const visible = () => page.evaluate(() => getComputedStyle(document.getElementById('wrh-online-panel')).display !== 'none');
    check('the online panel starts closed', !(await visible()));
    await page.click('#wrh-card-play');
    await page.click('#wrh-online');
    check('the Online button opens it', await visible());
    await page.screenshot({ path: join(out, 'menu_online.png') });
    await page.click('#wrh-online-x');
    check('the close button closes it', !(await visible()));
    await page.click('#wrh-online');
    await page.focus('#wrh-code');
    await page.keyboard.press('Escape');
    check('Escape closes it', !(await visible()));
    // the typed name survives a language change
    await page.fill('#wrh-name', 'Tester');
    await page.click('#tb-lang');
    await page.click('#tb-pop [data-lang="tr"]');
    await page.waitForTimeout(400);
    check('a language change keeps the page', (await page.evaluate(() => document.querySelector('.wrh-home').dataset.page)) === 'play');
    check('the typed name survives a language change', (await page.inputValue('#wrh-name')) === 'Tester');
    check('the labels follow the language', /Çevrimiçi/.test(await page.innerText('#wrh-online')));
    await ctx.close();
  }
  // an invite link
  {
    const { ctx, page } = await open(1366, 768, '?menu=1&join=ABCD');
    const state = await page.evaluate(() => ({ open: getComputedStyle(document.getElementById('wrh-online-panel')).display !== 'none', code: document.getElementById('wrh-code').value }));
    check('an invite link opens the online panel with the code', state.open && state.code === 'ABCD', JSON.stringify(state));
    check('an invite link opens the Play page', (await page.evaluate(() => document.querySelector('.wrh-home').dataset.page)) === 'play');
    await page.screenshot({ path: join(out, 'menu_invite.png') });
    await ctx.close();
  }
} catch (e) {
  console.log('FAIL  script error: ' + (e?.stack ?? e));
  results.push({ label: 'script', ok: false });
}
await browser.close();
server.close();
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(bad ? 1 : 0);
