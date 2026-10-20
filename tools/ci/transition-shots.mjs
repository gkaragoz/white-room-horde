// Clears a floor and takes a picture every 300 ms through the countdown, the climb and the arrival, with the phase and the
// arena the renderer shows, so a transition can be checked by eye (and the order of events by the log).
//   node tools/ci/transition-shots.mjs [map=0]   (after building the client)
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
const map = process.argv[2] ?? '0';
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 560), height: Number(process.env.H ?? 360) } });
await ctx.addInitScript(() => {
  localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
  localStorage.setItem('wrh.lang', 'en');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?solo=1&god=1&wave=1&map=${map}`);
await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
await page.evaluate(() => {
  const w = window.__wrh.world;
  w.misc[1] = 0;
  for (let i = 0; i < w.eActive.length; i++) w.eActive[i] = 0;
  w.enemyCount = 0;
});
let last = '';
for (let i = 0; i < 160; i++) {
  await sleep(Number(process.env.GAP ?? 300));
  const s = await page.evaluate(() => {
    const w = window.__wrh.world;
    return { tick: w.tick, phase: w.misc[4], map: w.map, wave: w.wave, entered: w.misc[6], build: window.__wrh.climb.buildStats(), other: window.__wrh.climb.buildStats(true) };
  });
  const line = `phase ${s.phase} map ${s.map} wave ${s.wave} entered ${s.entered} build ${s.build.mode} ${s.build.shown}/${s.build.total} done ${s.build.done} | other ${s.other.mode} ${s.other.shown}/${s.other.total}`;
  if (line !== last) console.log(i, line);
  last = line;
  await page.screenshot({ path: join(out, `trans_${String(i).padStart(2, '0')}.png`) });
  if (s.phase === 0 && s.wave > 1 && i > 10) break;
}
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors');
await browser.close();
server.close();
