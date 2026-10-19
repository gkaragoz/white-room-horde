// Runs the in-browser QA page (packages/client/qa.html) in real browsers and fails when any test fails.
//
//   node tools/ci/qa-browsers.mjs chromium            all tests (needs WebGL; headless Chromium has a software one)
//   node tools/ci/qa-browsers.mjs firefox webkit      the simulation determinism check only (cross-engine hashes)
//
// It serves packages/client/dist itself, so run `pnpm --filter @wrh/client build` first.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg' };

const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, p.split(String.fromCharCode(92)).join('/') === '/' ? 'index.html' : p);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const engines = { chromium, firefox, webkit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium'];
// Firefox and WebKit run the tests that do not need the WebGL renderer: determinism, controls, audio decoding, strings
const NO_GL = 'sim.determinism,controls.mapping,audio.bank,audio.formats,audio.spatial,input.devices,profile.unlocks,ui.strings';
const ONLY = { chromium: '', firefox: NO_GL, webkit: NO_GL };
let failed = false;

for (const name of wanted) {
  const browser = await engines[name].launch(name === 'chromium' ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const pick = process.env.QA_ONLY ?? ONLY[name];
  const only = pick ? `&only=${pick}` : '';
  await page.goto(`${base}/qa.html?auto=1${only}`);
  try {
    await page.waitForFunction(() => window.__qa && window.__qa.finished === true, undefined, { timeout: 8 * 60 * 1000, polling: 500 });
  } catch (e) {
    console.log(`[${name}] timed out; summary: ${await page.locator('#summary').innerText()}`);
    failed = true;
  }
  const report = await page.evaluate(() => window.__qa?.report ?? {});
  console.log(`\n== ${name} ==`);
  for (const [id, r] of Object.entries(report)) {
    console.log(`${r.status.toUpperCase().padEnd(5)} ${id.padEnd(24)} ${String(r.detail).split('\n')[0].slice(0, 150)}`);
    if (r.status === 'fail') failed = true;
  }
  if (!Object.keys(report).length) {
    console.log('no tests ran');
    failed = true;
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 3));
  await browser.close();
}

server.close();
process.exit(failed ? 1 : 0);
