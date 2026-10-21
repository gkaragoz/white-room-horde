// Plays the real game page with real keyboard and mouse events in a headless browser and checks that the controls do
// what they should: the menu starts a game, WASD moves, the mouse aims and fires, R reloads, Shift dashes, Esc pauses.
//
//   pnpm --filter @wrh/client build && node tools/ci/game-smoke.mjs [chromium|firefox|webkit]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
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

const name = process.argv[2] ?? 'chromium';
const engine = { chromium, firefox, webkit }[name];
const browser = await engine.launch(name === 'chromium' ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`);
});
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
/** Wait (a slow runner trails real time) until the weapon in the hands is `weapon`, at most 4 s. */
const weaponIs = async (weapon) => {
  for (let i = 0; i < 40; i++) {
    if ((await state()).weapon === weapon) return true;
    await sleep(100);
  }
  return false;
};
const state = () =>
  page.evaluate(() => {
    const w = window.__wrh.world;
    return w ? { tick: w.tick, x: w.pX[0], y: w.pY[0], mag: w.pMag[0], weapon: w.pWeapon[0], reload: w.pReload[0], dashCd: w.pDashCd[0], enemies: w.enemyCount, hp: w.pHp[0], kills: w.kills } : null;
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Hold keys until the simulation has really advanced `ticks` (slow headless rendering must not swallow short presses). */
async function hold(keys, ticks) {
  const t0 = (await state()).tick;
  for (const k of keys) await page.keyboard.down(k);
  for (let i = 0; i < 400; i++) {
    if ((await state()).tick >= t0 + ticks) break;
    await sleep(25);
  }
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}

try {
  // a fresh profile: the menu appears and "Play solo" starts a game
  await page.goto(`${base}/?menu=1`);
  await page.waitForSelector('#wrh-solo, #wrh-nogl', { timeout: 60000, state: 'attached' });
  if (await page.locator('#wrh-nogl').count()) {
    // a browser without a WebGL context (headless Firefox on Linux): the game must say so instead of staying blank
    const text = await page.locator('#wrh-nogl').innerText();
    check('browser without WebGL shows a clear message', /WebGL/.test(text), text.slice(0, 80));
    await browser.close();
    server.close();
    process.exit(name === 'chromium' || !results.every((r) => r.ok) ? 1 : 0);
  }
  check('menu shows Play solo', true);
  await page.click('#wrh-card-play'); // the hub's Play card opens the Play page
  await page.click('#wrh-solo');
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 5, undefined, { timeout: 60000 });
  check('solo game starts from the menu', true);
  await page.evaluate(() => window.focus());
  await page.mouse.move(700, 380);
  await sleep(600);

  // WASD moves the player
  const a = await state();
  await hold(['KeyD'], 20);
  const b = await state();
  // headless software rendering can be slow, so judge the distance against the simulation ticks that really ran
  const moved = Math.hypot(b.x - a.x, b.y - a.y);
  const ticksD = b.tick - a.tick;
  check('holding D moves the player at full speed', ticksD > 3 && moved > ticksD * 0.2 * 0.7, `${moved.toFixed(1)} units in ${ticksD} ticks`);
  await hold(['KeyW'], 12);
  const c = await state();
  const ticksW = c.tick - b.tick;
  check('holding W moves the player at full speed', ticksW > 2 && Math.hypot(c.x - b.x, c.y - b.y) > ticksW * 0.2 * 0.7, `${ticksW} ticks`);

  // mouse fire consumes the magazine
  await page.mouse.move(900, 300);
  const m0 = (await state()).tick;
  await page.mouse.down();
  // software rendering in CI runs only a few ticks per second: hold the button until the simulation has really moved on
  for (let i = 0; i < 400 && (await state()).tick < m0 + 10; i++) await sleep(25);
  await page.mouse.up();
  const d = await state();
  check('mouse click fires (magazine shrinks)', d.mag < 12 || d.reload > 0, `mag ${d.mag}`);

  // R reloads
  await hold(['KeyR'], 3);
  const e1 = await state();
  for (let i = 0; i < 700 && (await state()).mag < 12; i++) await sleep(50); // (CI renders in software: the reload takes long in real time)
  const e2 = await state();
  check('R starts a reload and the magazine fills again', (e1.reload > 0 || e2.mag === 12) && e2.mag === 12, `mag ${e2.mag}`);

  // Shift dashes
  const f0 = await state();
  await hold(['ShiftLeft', 'KeyD'], 4);
  const f1 = await state();
  check('Shift dashes (cooldown starts, fast movement)', f1.dashCd > 0 && Math.hypot(f1.x - f0.x, f1.y - f0.y) > 0.8, `cooldown ${f1.dashCd.toFixed(2)}`);

  // weapon keys: put an MP (rank 2) and a shotgun (rank 3) in the bag; 2 picks the MP, Q walks up to the shotgun, 1 is the pistol
  await page.evaluate(() => {
    const w = window.__wrh.world;
    w.pOwned[0] |= (1 << 8) | (1 << 3); // mp and shotgun (indices in WEAPON_IDS)
    w.pInvMag[8] = 20;
    w.pInvMag[3] = 6;
  });
  await hold(['Digit2', 'KeyQ'], 4);
  check('number keys and Q no longer pick a weapon', (await state()).weapon === 0, `weapon ${(await state()).weapon}`);
  await page.click('.wrh-inv .row[data-w="9"]');
  check('a click on the MP row takes the MP', await weaponIs(8), `weapon ${(await state()).weapon}`);
  await page.click('.wrh-inv .row[data-w="4"]');
  check('a click on the shotgun row takes the shotgun', await weaponIs(3), `weapon ${(await state()).weapon}`);
  await page.click('.wrh-inv .row[data-w="1"]');
  check('a click on the pistol row takes the pistol', await weaponIs(0), `weapon ${(await state()).weapon}`);
  const inv = await page.evaluate(() => document.querySelectorAll('.wrh-inv .row').length);
  check('the weapon list shows the owned weapons', inv === 3, `${inv} rows`);

  // Esc pauses the simulation and resumes it
  await page.keyboard.press('Escape');
  await sleep(300);
  const p0 = await state();
  await sleep(800);
  const p1 = await state();
  check('Esc pauses the game', p1.tick === p0.tick, `tick ${p0.tick} -> ${p1.tick}`);
  await page.keyboard.press('Escape');
  // software rendering in CI can be slow: give the simulation a few seconds to move on
  let p2 = await state();
  for (let i = 0; i < 20 && p2.tick <= p1.tick + 5; i++) {
    await sleep(300);
    p2 = await state();
  }
  check('Esc again resumes it', p2.tick > p1.tick + 5);

  // the horde arrives
  await page.waitForFunction(() => window.__wrh.world.enemyCount > 5, undefined, { timeout: 30000 });
  check('enemies spawn and the HUD is drawn', (await page.locator('.wrh-top').count()) > 0);
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('smoke run completed', false, String(err).slice(0, 300));
  console.log('page problems:', errors.slice(0, 5));
  console.log('page text:', (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 200));
}

await browser.close();
server.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
