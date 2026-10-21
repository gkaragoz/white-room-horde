// Measures frame-time spikes in a scripted fight: every requestAnimationFrame delta, long tasks, heap sawtooth (garbage
// collections) and what the renderer holds. Prints percentiles and the worst frames with the in-game events around them.
//
//   pnpm --filter @wrh/client build && node tools/ci/perf-spikes.mjs [seconds=20] [wave=3] [bots=2] [--soft]
// --soft uses the software renderer (CI machines); without it the real GPU is used when the machine has one.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const soft = args.includes('--soft');
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const seconds = nums[0] ?? 20;
const wave = nums[1] ?? 3;
const bots = nums[2] ?? 2;
const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
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
const flags = soft
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: [...flags, '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 480), height: Number(process.env.H ?? 270) } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
    localStorage.setItem('wrh.lang', 'en');
  } catch {}
  window.__f = [];
  window.__long = [];
  window.__heap = [];
  let last = performance.now();
  const loop = (t) => {
    window.__f.push([t, t - last]);
    last = t;
    const m = performance.memory;
    if (m) window.__heap.push([t, m.usedJSHeapSize]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
await page.goto(`${base}/?solo=1&god=1&auto=1&bots=${bots}&wave=${wave}&map=0`);
await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 60, null, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000)); // let the first-use compiles pass: they are measured separately below
const warm = await page.evaluate(() => window.__f.length);
const t0 = await page.evaluate(() => performance.now());
const cdp = args.includes('--profile') ? await ctx.newCDPSession(page) : null;
if (cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
}
await new Promise((r) => setTimeout(r, seconds * 1000));
if (cdp) {
  // self time per function from the sampling profile: where the main thread really spends its time
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log('--- main-thread self time (top 25) ---');
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`${((v / total) * 100).toFixed(1).padStart(5)} %  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`));
}
const data = await page.evaluate(
  ({ t0 }) => ({
    frames: window.__f.filter((f) => f[0] >= t0),
    all: window.__f,
    long: window.__long.filter((l) => l[0] >= t0),
    heap: window.__heap.filter((h) => h[0] >= t0),
    info: window.__wrh.stage.renderer.info.render,
    mem: window.__wrh.stage.renderer.info.memory,
    programs: window.__wrh.stage.renderer.info.programs?.length ?? 0,
    enemies: window.__wrh.world.enemyCount,
    kills: window.__wrh.world.kills,
  }),
  { t0 },
);
const dts = data.frames.map((f) => f[1]).sort((a, b) => a - b);
const q = (p) => dts[Math.min(dts.length - 1, Math.floor(dts.length * p))] ?? 0;
let gcs = 0;
for (let i = 1; i < data.heap.length; i++) if (data.heap[i][1] < data.heap[i - 1][1] - 262144) gcs++;
const worst = [...data.frames].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`${soft ? 'software' : 'GPU'} renderer, ${seconds} s, wave ${wave}, ${bots} bots; ${data.enemies} enemies alive, ${data.kills} kills`);
console.log(`frames ${dts.length}  avg ${(dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length)).toFixed(1)} ms  p50 ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  p99 ${q(0.99).toFixed(1)}  max ${q(1).toFixed(1)}`);
console.log(`frames over 33 ms: ${dts.filter((d) => d > 33.4).length}   over 50 ms: ${dts.filter((d) => d > 50).length}   over 100 ms: ${dts.filter((d) => d > 100).length}`);
console.log(`long tasks (>50 ms): ${data.long.length}  total ${data.long.reduce((a, l) => a + l[1], 0).toFixed(0)} ms   heap drops (garbage collections): ${gcs}`);
console.log(`worst frames: ${worst.map((f) => f[1].toFixed(0)).join(', ')} ms`);
console.log(`renderer: ${data.info.calls} calls, ${data.info.triangles} triangles, ${data.mem.geometries} geometries, ${data.mem.textures} textures, ${data.programs} programs`);
console.log(`first ${warm} frames (before measuring) hold the one-off compiles: worst ${Math.max(...data.all.slice(0, warm).map((f) => f[1])).toFixed(0)} ms`);
if (errors.length) console.log('PAGE ERRORS:\n- ' + errors.slice(0, 5).join('\n- '));
if (args.includes('--levers')) {
  // what each lever buys on this machine: average frame time over four seconds with it pulled
  const avg = () =>
    page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const a = performance.now();
          const f = () => {
            n++;
            if (performance.now() - a < 4000) requestAnimationFrame(f);
            else res((performance.now() - a) / n);
          };
          requestAnimationFrame(f);
        }),
    );
  const row = async (label) => console.log(`lever ${label.padEnd(34)} ${(await avg()).toFixed(0)} ms/frame`);
  await row('as is');
  await page.evaluate(() => (window.__wrh.crowd.group.visible = false));
  await row('horde not drawn');
  await page.evaluate(() => {
    window.__wrh.crowd.group.visible = true;
    window.__wrh.crowd.setShadows(false);
  });
  await row('horde shadows off');
  await page.evaluate(() => window.__wrh.stage.setScale(0.55));
  await row('shadows off + resolution 0.55');
}
await browser.close();
server.close();
