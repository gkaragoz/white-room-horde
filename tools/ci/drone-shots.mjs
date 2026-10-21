// The drones in the real game page: one screenshot per type, the HUD card and the inventory list (a click switches), and
// the flight over a ramp (the drone must follow its owner up and down without going into the ground or jumping).
//
//   pnpm --filter @wrh/client build && node tools/ci/drone-shots.mjs
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const out = resolve(fileURLToPath(new URL('../blender/out/drones', import.meta.url)));
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
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
const NAMES = ['healer', 'cryo', 'rocket', 'gun', 'twin', 'tesla', 'collector'];

const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('wrh.notesSeen', '999.0');
    localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
    localStorage.setItem('wrh.lang', 'en');
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
try {
  await page.goto(`${base}/?solo=1&god=1&wave=4&map=8`);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30 && window.__wrh.drones?.loaded, null, { timeout: 120000 });
  await sleep(1500);
  // every drone type, each at a level that shows a power tier
  await page.evaluate(() => {
    const w = window.__wrh.world;
    for (let t = 0; t < 7; t++) w.pDLv[t] = 11;
    w.pDrone[0] = 1;
    w.pDWarm[0] = 0;
  });
  await sleep(1200);
  const hud = await page.evaluate(() => ({ card: !!document.querySelector('#h-drone .dr-card'), text: document.querySelector('#h-drone')?.innerText ?? '' }));
  check('the drone card is in the HUD', hud.card, hud.text.replace(/\s+/g, ' ').slice(0, 60));
  // the list opens on a click and a row switches the drone
  await page.click('#h-drone .dr-card');
  await page.waitForSelector('#h-drone .dr-row', { timeout: 8000 }).catch(() => {});
  const rows = await page.locator('#h-drone .dr-row').count();
  check('a click opens the list of the seven drones', rows === 7, `${rows}`);
  await page.screenshot({ path: join(out, 'hud_list.png') });
  await page.click('#h-drone .dr-row[data-dt="3"]');
  await page.waitForFunction(() => window.__wrh.world.pDrone[0] === 4, null, { timeout: 8000 }).catch(() => {});
  const now = await page.evaluate(() => window.__wrh.world.pDrone[0]);
  check('a row switches the active drone (gun)', now === 4, `${now}`);
  const warm = await page.evaluate(() => window.__wrh.world.pDWarm[0]);
  check('and the new drone warms up', warm > 0 && warm <= 4, `${warm.toFixed(2)}`);
  for (let t = 0; t < 7; t++) {
    await page.evaluate((k) => {
      const w = window.__wrh.world;
      w.pDrone[0] = k + 1;
      w.pDWarm[0] = 0;
    }, t);
    await sleep(t === 6 ? 2500 : 3500);
    // no card offer in the way, then a close-up of the middle of the screen where the owner and the drone are
    await page.evaluate(() => {
      const w = window.__wrh.world;
      for (let i = 0; i < 3; i++) w.pOffer[i] = -1;
      w.pPending[0] = 0;
    });
    await sleep(500);
    await page.screenshot({ path: join(out, `drone_${NAMES[t]}.png`), clip: { x: 280, y: 170, width: 400, height: 260 } });
    const d = await page.evaluate(() => window.__wrh.drones.positionOf(0));
    check(`the ${NAMES[t]} drone is drawn`, !!d, d ? `${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.z.toFixed(2)}` : '');
  }
  // the flight over a ramp: the owner walks up the ramp and back down while the drone follows
  await page.evaluate(() => {
    const w = window.__wrh.world;
    w.pDrone[0] = 4;
    w.pDWarm[0] = 0;
  });
  const ramp = await page.evaluate(() => {
    const w = window.__wrh.world;
    const r = window.__wrh.maps[w.map].ramps?.[0];
    return r ? { ...r } : null;
  });
  check('the arena has a ramp', !!ramp);
  if (ramp) {
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][ramp.dir];
    const len = ramp.dir % 2 === 0 ? ramp.w : ramp.h;
    const start = { x: ramp.x - D[0] * (len / 2 + 5), y: ramp.y - D[1] * (len / 2 + 5) };
    await page.evaluate((s) => {
      const w = window.__wrh.world;
      // a quiet arena: nobody pushes the owner around on the ramp and the floor cannot be 'cleared' under us
      w.waveTick = 1e9;
      w.misc[3] = 0;
      w.misc[1] = 0;
      for (let i = 0; i < w.eActive.length; i++) w.eActive[i] = 0;
      w.enemyCount = 0;
      w.pX[0] = s.x;
      w.pY[0] = s.y;
      w.pLayer[0] = 0;
    }, start);
    await sleep(2500);
    await page.evaluate(() => window.__wrh.drones.debug(0, true));
    // the owner is walked along the climb at the running pace (the layer follows the rule of the simulation)
    const walk = (from, to) =>
      page.evaluate(
        ([a, b]) =>
          new Promise((res) => {
            const w = window.__wrh.world;
            const map = window.__wrh.maps[w.map];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            let t0 = performance.now();
            let prev = 0;
            const tick = () => {
              const k = Math.min(1, ((performance.now() - t0) / 1000) * 11 / len);
              // in steps of at most 0.2 units: a busy runner can deliver a late timer that jumps over the end of the ramp, where the layer changes
              const n = Math.max(1, Math.ceil(((k - prev) * len) / 0.2));
              for (let i = 1; i <= n; i++) {
                const kk = prev + ((k - prev) * i) / n;
                w.pX[0] = a.x + (b.x - a.x) * kk;
                w.pY[0] = a.y + (b.y - a.y) * kk;
                w.pLayer[0] = window.__wrh.geo.nextLayer(map, w.pX[0], w.pY[0], w.pLayer[0]);
              }
              prev = k;
              if (k < 1) setTimeout(tick, 8);
              else res({ layer: w.pLayer[0], z: window.__wrh.drones.debug(0).z });
            };
            tick();
          }),
        [from, to],
      );
    const far = { x: ramp.x + D[0] * (len / 2 + 6), y: ramp.y + D[1] * (len / 2 + 6) };
    const top = await walk(start, far);
    // the drone rises with a spring: on a slow runner it is still on its way when the owner arrives, so give it a moment
    for (let i = 0; i < 40 && top.z <= 2; i++) {
      await sleep(100);
      top.z = await page.evaluate(() => window.__wrh.drones.debug(0).z);
    }
    await sleep(900);
    await walk(far, start);
    const dbg = await page.evaluate(() => window.__wrh.drones.debug(0));
    check('the owner reached the deck and the drone rose with it', top.layer === 1 && top.z > 2, `layer ${top.layer}, drone height ${top.z.toFixed(2)}`);
    check('the drone never flew into the ground (clearance >= 0.6)', dbg.minClear >= 0.6, `${dbg.minClear.toFixed(2)}`);
    check('the climb is smooth (vertical speed < 10 u/s)', dbg.maxVz < 10, `${dbg.maxVz.toFixed(2)}`);
    // a step per frame grows when the runner draws few frames: the limit is 3 u at 30 fps or better and scales up below that
    const fpsNow = await page.evaluate(() => window.__wrh.perf.fps || 60);
    const stepLimit = 3 * Math.max(1, 30 / Math.max(5, fpsNow));
    check(`and it did not jump (largest step per frame < ${stepLimit.toFixed(1)} u at ${fpsNow} fps)`, dbg.maxStep < stepLimit, `${dbg.maxStep.toFixed(2)} over ${dbg.frames} frames`);
    await page.screenshot({ path: join(out, 'ramp.png') });
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  script error: ' + (e?.stack ?? e));
  results.push({ label: 'script', ok: false });
}
await browser.close();
server.close();
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(bad ? 1 : 0);

async function walkFor(pg, key, ms) {
  await pg.keyboard.down(key);
  await sleep(ms);
  await pg.keyboard.up(key);
  return true;
}
