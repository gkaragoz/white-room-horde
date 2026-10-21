// Plays a short solo game, lets the player die and takes pictures of the game-over page while its cards come in.
//   node tools/ci/gameover-shots.mjs   (after building the client)
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
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.lang', 'en');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?solo=1&wave=5&map=0`);
await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
// some play first, so the numbers are not all zero
await page.mouse.move(700, 350);
await page.mouse.down();
await page.keyboard.down('d');
await sleep(2500);
await page.keyboard.up('d');
await page.mouse.up();
await page.evaluate(() => {
  const w = window.__wrh.world;
  w.pHp[0] = 0;
});
await page.waitForFunction(() => window.__wrh.world.pState[0] === 1, null, { timeout: 20000 }).catch(() => undefined);
await page.evaluate(() => {
  window.__wrh.world.pTimer[0] = 0.02;
});
await page.waitForSelector('.wrh-go', { timeout: 30000 });
let n = 0;
for (let i = 0; i < 14; i++) {
  await sleep(450);
  if (i % 3 === 1) await page.screenshot({ path: join(out, `over_${n++}.png`) });
}
await page.mouse.click(550, 400);
await sleep(600);
await page.screenshot({ path: join(out, 'over_final.png') });
const cards = await page.locator('.wrh-go-card.in').count();
console.log('cards shown', cards, errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors');
await browser.close();
server.close();
process.exit(errors.length || cards < 10 ? 1 : 0);
