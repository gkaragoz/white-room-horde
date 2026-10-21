// Plays the real game page in a headless browser through everything the later versions added and checks what happens:
// every class (its ability with a real key press, its attack with a real mouse button), every vertical arena with scripted
// players, the finisher after the last kill, the menu with nine classes in two languages. Fails on any page error, console
// error or missing file. Screenshots go to tools/blender/out/play.
//
//   pnpm --filter @wrh/client build && node tools/ci/play-all.mjs
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const shots = resolve(fileURLToPath(new URL('../blender/out/play', import.meta.url)));
mkdirSync(shots, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, p.split(String.fromCharCode(92)).join('/') === '/' ? 'index.html' : p);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

async function open(url, profile = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript((p) => {
    try {
      localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1, ...p }));
      localStorage.setItem('wrh.lang', 'en');
    } catch {}
  }, profile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`);
  });
  await page.goto(base + url);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick >= 0, null, { timeout: 90000 });
  return { page, ctx, errors };
}
const world = (page, fn) => page.evaluate(fn);
async function ticks(page, n, max = 40000) {
  const t0 = await page.evaluate(() => window.__wrh.world.tick);
  const start = Date.now();
  while (Date.now() - start < max) {
    if ((await page.evaluate(() => window.__wrh.world.tick)) >= t0 + n) return true;
    await sleep(50);
  }
  return false;
}

const CLASS_NAMES = ['soldier', 'medic', 'heavy', 'scout', 'demolisher', 'ranger', 'berserker', 'swordsman', 'hammerer'];

try {
  // ---- every class: its weapon, its ability on a real key, its attack on a real mouse button -------------------------
  for (let cls = 0; cls < 9; cls++) {
    const { page, ctx, errors } = await open('/?solo=1&wave=6&map=' + (cls % 6), { cls });
    await ticks(page, 30);
    const info = await world(page, () => {
      const w = window.__wrh.world;
      return { cls: w.pPerk[16], weapon: w.pWeapon[0], owned: w.pOwned[0] };
    });
    check(`${CLASS_NAMES[cls]}: starts as that class`, info.cls === cls);
    if (cls >= 7) check(`${CLASS_NAMES[cls]}: carries only its own weapon`, info.owned === 1 << info.weapon, `owned ${info.owned.toString(2)}`);
    // the ability: hold F until the simulation has seen it
    const before = await world(page, () => window.__wrh.world.pSpecCd[0]);
    await page.keyboard.down('f');
    for (let i = 0; i < 100; i++) {
      if ((await world(page, () => window.__wrh.world.pSpecCd[0])) > 1) break;
      await sleep(40);
    }
    await page.keyboard.up('f');
    const after = await world(page, () => ({ cd: window.__wrh.world.pSpecCd[0], t: window.__wrh.world.pSpecT[0], over: window.__wrh.world.pOver[0], rally: window.__wrh.world.pRally[0] }));
    check(`${CLASS_NAMES[cls]}: the F key uses the ability (cooldown ${before.toFixed(1)} -> ${after.cd.toFixed(1)})`, after.cd > 1);
    // the attack: spread of enemies around, mouse held
    await world(page, () => {
      const W = window.__wrh;
      const w = W.world;
      for (let k = 0; k < 14; k++) W.hazards.spawnEnemy(w, 0, w.pX[0] + 2.2 + (k % 5) * 0.9, w.pY[0] - 2 + k * 0.4, false);
    });
    await page.mouse.move(700, 350);
    await page.mouse.down();
    await ticks(page, 90);
    await page.mouse.up();
    await ticks(page, 45); // a charged swing lands after the button is released
    const fight = await world(page, () => ({ dmg: window.__wrh.world.pPerk[21], kills: window.__wrh.world.kills, hp: window.__wrh.world.pHp[0] }));
    check(`${CLASS_NAMES[cls]}: the attack deals damage (${Math.round(fight.dmg)}) and kills (${fight.kills})`, fight.dmg > 20 && (fight.kills > 0 || fight.dmg > 100)); // (the enemies are chunkier now: a weak hitter may not finish one in two seconds)
    await page.screenshot({ path: join(shots, `class_${cls}_${CLASS_NAMES[cls]}.png`) });
    check(`${CLASS_NAMES[cls]}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- the vertical arenas with scripted players ---------------------------------------------------------------------
  for (const [id, map] of [['overpass', 6], ['depot', 7], ['rampyard', 8], ['tunnelhub', 9], ['mezzanine', 10]]) {
    const { page, ctx, errors } = await open(`/?solo=1&god=1&auto=1&bots=2&wave=14&map=${map}`);
    await ticks(page, 240);
    const st = await world(page, () => {
      const w = window.__wrh.world;
      return { map: w.map, tick: w.tick, enemies: w.enemyCount, layers: [...w.pLayer].slice(0, 3), calls: window.__wrh.perf.calls };
    });
    check(`${id}: plays (map ${st.map}, tick ${st.tick}, ${st.enemies} enemies)`, st.map === map && st.enemies > 0);
    await page.screenshot({ path: join(shots, `arena_${id}.png`) });
    check(`${id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- the finisher: the last enemy dies, the camera pushes in, the countdown waits ----------------------------------
  {
    const { page, ctx, errors } = await open('/?solo=1&god=1&map=0');
    await ticks(page, 60);
    // kill everything the floor will ever send the way the sim does it: run the wave to its end, then empty the arena
    await world(page, () => {
      const w = window.__wrh.world;
      w.misc[1] = 0; // nothing more to arrive
      for (let i = 0; i < w.eActive.length; i++) w.eActive[i] = 0;
      w.enemyCount = 0;
    });
    let cine = false;
    for (let i = 0; i < 80 && !cine; i++) {
      cine = await world(page, () => window.__wrh.cine.active);
      await sleep(40);
    }
    check('the finisher starts when the floor is cleared', cine);
    if (cine) {
      let bars = 'none';
      for (let i = 0; i < 40 && bars !== 'block'; i++) {
        await sleep(50);
        bars = await page.evaluate(() => { const e = document.querySelector('.wrh-cine'); return e ? getComputedStyle(e).display : 'missing'; });
      }
      await page.screenshot({ path: join(shots, 'finisher.png') });
      check('the finisher bars and label are on screen', bars === 'block', bars);
    }
    await sleep(2500);
    const after = await world(page, () => ({ phase: window.__wrh.world.misc[4], cine: window.__wrh.cine.active, zoom: window.__wrh.stage.camera.zoom }));
    check('afterwards the view is back to normal and the countdown runs', !after.cine && Math.abs(after.zoom - 1) < 0.01 && after.phase === 1, JSON.stringify(after));
    check('finisher: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- the menu: nine classes, two languages --------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)));
    await page.goto(`${base}/?menu=1`);
    await page.waitForSelector('#wrh-solo', { timeout: 90000 });
    const n = await page.locator('.wrh-class[data-cls]').count();
    check('the lobby offers nine classes', n === 9, String(n));
    await page.locator('.wrh-class[data-cls="8"]').click();
    const tip = await page.locator('#wrh-class-tip').innerText();
    check('picking the hammerer shows its tip with the ability', /hammer/i.test(tip) && /Ability/i.test(tip), tip.slice(0, 60));
    const dim = await page.locator('.wrh-wp.dim').count();
    check('the gun list is greyed out for a melee class', dim > 5, String(dim));
    await page.screenshot({ path: join(shots, 'menu_en.png') });
    await page.locator('#tb-lang').click();
    await page.locator('[data-lang="tr"]').first().click().catch(() => {});
    await sleep(400);
    const trTip = await page.locator('#wrh-class-tip').innerText().catch(() => '');
    check('the menu switches to Turkish (class tip)', /Yetenek/.test(trTip), trTip.slice(0, 60));
    await page.screenshot({ path: join(shots, 'menu_tr.png') });
    check('menu: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('the script itself ran to the end', false, String(e).slice(0, 300));
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
