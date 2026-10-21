// A swordsman cuts through a crowd on the highest Gore setting; screenshots show the blood, the flying parts and the
// bodies afterwards, and the page must stay free of errors. Pictures go to tools/blender/out/play.
//   node tools/ci/gore-shots.mjs   (after building the client)
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
const ctx = await browser.newContext({ viewport: { width: 900, height: 620 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 7, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.settings', JSON.stringify({ gore: 2 }));
  localStorage.setItem('wrh.lang', 'en');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
await page.goto(`${base}/?solo=1&god=1&wave=4&map=0`);
await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
await page.evaluate(() => {
  const W = window.__wrh;
  const w = W.world;
  for (let k = 0; k < 24; k++) W.hazards.spawnEnemy(w, 0, w.pX[0] + 2 + (k % 6) * 0.8, w.pY[0] - 2.5 + Math.floor(k / 6) * 1.2, false);
});
await page.mouse.move(650, 310);
await page.mouse.down();
let n = 0;
for (let i = 0; i < 40; i++) {
  await sleep(150);
  if (i % 8 === 3) await page.screenshot({ path: join(out, `gore_${n++}.png`) });
}
await page.mouse.up();
const kills = await page.evaluate(() => window.__wrh.world.kills);
const parts = await page.evaluate(() => window.__wrh.goreParts.spawned);
console.log('kills', kills, 'parts torn off', parts, errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors');
await browser.close();
server.close();
process.exit(errors.length || parts < 1 ? 1 : 0);
