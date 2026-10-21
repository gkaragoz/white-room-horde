// One picture of every arena from far above (?zoom), for a look at the layouts.
//   node tools/ci/map-shots.mjs   (after building the client)
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
const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.lang', 'en');
});
const errors = [];
for (let m = 0; m < 11; m++) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/?solo=1&god=1&wave=1&map=${m}&zoom=0.42`);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
  await page.evaluate(() => {
    const w = window.__wrh.world;
    w.misc[1] = 0;
    for (let i = 0; i < w.eActive.length; i++) w.eActive[i] = 0;
    w.enemyCount = 0;
  });
  await sleep(1500);
  await page.screenshot({ path: join(out, `map_${String(m).padStart(2, '0')}.png`) });
  await page.close();
}
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors');
await browser.close();
server.close();
