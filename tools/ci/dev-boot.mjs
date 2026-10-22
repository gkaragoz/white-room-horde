// Starts the game the way `pnpm dev` does (Vite dev server, native ES modules) and checks it boots: no page error, a world
// that ticks. The production build bundles modules in a way that hides use-before-declaration mistakes (a `let` read at
// start-up before its line has run), so the build-based checks cannot catch what only the dev server shows.
//
//   node tools/ci/dev-boot.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const client = resolve(fileURLToPath(new URL('../../packages/client', import.meta.url)));
const vitePath = createRequire(resolve(client, 'package.json')).resolve('vite');
const { createServer } = await import(pathToFileURL(vitePath).href);

const server = await createServer({ root: client, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await page.goto(`${base}/?solo=1&god=1&wave=2&map=0`);
  const booted = await page
    .waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 120000 })
    .then(() => true)
    .catch(() => false);
  console.log(`${booted ? 'PASS' : 'FAIL'}  the dev server game boots and its world ticks`);
  console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'}  no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  failed = !booted || errors.length > 0;
  // the meta progression, as a new player meets it: level 1, so the first run plays on the small pool
  const meta = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const metaErrors = [];
  meta.on('pageerror', (e) => metaErrors.push(String(e).split('\n')[0]));
  await meta.goto(`${base}/?solo=1&meta=1&wave=1&map=0`);
  const metaOk = await meta
    .waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30 && window.__wrh.world.metLevel === 1, null, { timeout: 120000 })
    .then(() => true)
    .catch(() => false);
  console.log(`${metaOk ? 'PASS' : 'FAIL'}  a new player's game starts at meta level 1 and ticks`);
  console.log(`${metaErrors.length === 0 ? 'PASS' : 'FAIL'}  no page errors in the meta game${metaErrors.length ? ': ' + metaErrors.join(' | ') : ''}`);
  failed = failed || !metaOk || metaErrors.length > 0;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
