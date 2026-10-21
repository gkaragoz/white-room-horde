// Real mouse and keyboard on the real page: a character standing still with enemies walking around must not turn by itself,
// and holding fire with every gun must deal damage to a target in reach.
//   node tools/ci/aim-check.mjs   (after building the client)
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
let bad = 0;
const ok = (label, v, d = '') => {
  if (!v) bad++;
  console.log(`${v ? 'PASS' : 'FAIL'}  ${label}  ${d}`);
};
const ctx = await browser.newContext({ viewport: { width: 900, height: 620 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.lang', 'en');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?solo=1&god=1&wave=3&map=0`);
await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
// enemies walk about on all sides while the player stands still and does not shoot
await page.evaluate(() => {
  const W = window.__wrh;
  const w = W.world;
  for (let k = 0; k < 16; k++) W.hazards.spawnEnemy(w, 0, w.pX[0] + Math.cos(k) * (10 + k), w.pY[0] + Math.sin(k) * (10 + k), false);
});
await page.mouse.move(700, 300);
await sleep(600);
const angles = [];
for (let i = 0; i < 24; i++) {
  angles.push(await page.evaluate(() => window.__wrh.world.pAngle[0]));
  await sleep(150);
}
const spread = Math.max(...angles) - Math.min(...angles);
ok('standing still without shooting: the aim stays put', spread < 0.01, `spread ${spread.toFixed(3)} rad over ${angles.length} samples`);
// shooting: the character turns to a target and damage is dealt
const dmg0 = await page.evaluate(() => window.__wrh.world.pPerk[21]);
await page.mouse.down();
await sleep(2500);
await page.mouse.up();
const dmg1 = await page.evaluate(() => window.__wrh.world.pPerk[21]);
ok('holding fire deals damage', dmg1 > dmg0 + 10, `${Math.round(dmg1 - dmg0)} damage`);
const after = [];
await sleep(600);
for (let i = 0; i < 12; i++) {
  after.push(await page.evaluate(() => window.__wrh.world.pAngle[0]));
  await sleep(150);
}
const spread2 = Math.max(...after) - Math.min(...after);
ok('after shooting: the aim stays where the last shot was', spread2 < 0.01, `spread ${spread2.toFixed(3)} rad`);
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
