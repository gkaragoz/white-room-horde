// Puts every new enemy and boss next to the player and takes a picture of each; also fires every new gun once.
// Pictures go to tools/blender/out/play. The page must stay free of errors.
//   node tools/ci/new-content-shots.mjs   (after building the client)
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const out = resolve(fileURLToPath(new URL('../blender/out/play', import.meta.url)));
mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
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
const NEW = ['pouncer', 'hurler', 'grabber', 'spiker', 'shocker', 'brood', 'trapper', 'warcaller', 'chopper', 'quaker'];
const GUNS = ['railgun', 'crossbow', 'plasma', 'rocket', 'nailgun', 'autoshotgun', 'akimbo', 'frostgun', 'sawlauncher', 'arcthrower'];
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 60, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.lang', 'en');
});
const errors = [];
let bad = 0;
const ok = (label, v, d = '') => {
  if (!v) bad++;
  console.log(`${v ? 'PASS' : 'FAIL'}  ${label}  ${d}`);
};
// every new enemy and boss, in a row in front of the camera
{
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/?solo=1&god=1&wave=2&map=0&zoom=0.9`);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
  await page.evaluate((names) => {
    const W = window.__wrh;
    const w = W.world;
    w.misc[1] = 0;
    for (let i = 0; i < w.eActive.length; i++) w.eActive[i] = 0;
    w.enemyCount = 0;
    const types = ['grunt', 'runner', 'tank', 'exploder', 'spitter', 'shielder', 'spawner', 'crawler', 'leaper', 'bloater', 'screamer', 'acider', 'rammer', 'flamer', 'mortar', 'sledge', 'lamper', 'blinker', 'marksman', 'reviver', 'magnetar', 'pouncer', 'hurler', 'grabber', 'spiker', 'shocker', 'brood', 'trapper', 'warcaller', 'chopper', 'quaker'];
    names.forEach((n, k) => {
      const e = W.hazards.spawnEnemy(w, types.indexOf(n), w.pX[0] - 9 + k * 2.1, w.pY[0] + 5, false);
      w.eFrost[e] = 1e6; // standing still for the picture
    });
    for (let v = 7; v <= 11; v++) {
      const b = W.spawnBoss();
      w.eBoss[b] = v;
      w.eFrost[b] = 1e6;
      w.eX[b] = w.pX[0] - 10 + (v - 7) * 5;
      w.eY[b] = w.pY[0] + 11;
    }
  }, NEW);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: join(out, 'new_enemies.png') });
  const alive = await page.evaluate(() => window.__wrh.world.enemyCount);
  ok('the new enemies and bosses stand in view', alive >= 15, String(alive));
  await page.close();
}
// every new gun fires and hurts
for (const gun of GUNS) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/?solo=1&god=1&wave=2&map=0`);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
  await page.evaluate((id) => {
    const W = window.__wrh;
    const w = W.world;
    const ids = ['pistol', 'smg', 'ar', 'shotgun', 'hmg', 'minigun', 'sniper', 'revolver', 'mp', 'dbl', 'dmr', 'flamer', 'gl', 'sword', 'hammer', 'railgun', 'crossbow', 'plasma', 'rocket', 'nailgun', 'autoshotgun', 'akimbo', 'frostgun', 'sawlauncher', 'arcthrower'];
    const k = ids.indexOf(id);
    w.pOwned[0] |= 1 << k;
    w.pWeapon[0] = k;
    w.pMag[0] = 99;
    for (let i = 0; i < 12; i++) W.hazards.spawnEnemy(w, 0, w.pX[0] + 3 + (i % 4) * 1.2, w.pY[0] - 2 + Math.floor(i / 4) * 1.5, false);
  }, gun);
  await page.mouse.move(700, 330);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: join(out, `gun_${gun}.png`) });
  await page.mouse.up();
  const dmg = await page.evaluate(() => window.__wrh.world.pPerk[21]);
  ok(`${gun} fires and hurts`, dmg > 0, `${Math.round(dmg)} damage`);
  await page.close();
}
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
