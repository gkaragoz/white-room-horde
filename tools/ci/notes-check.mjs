// The version number opens the release notes window; it follows the interface language and closes with Esc or a click outside.
//   node tools/ci/notes-check.mjs   (after building the client)
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
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.addInitScript(() => localStorage.setItem('wrh.lang', 'en'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?menu=1`);
await page.waitForSelector('#wrh-version', { timeout: 90000 });
await page.click('#wrh-version');
await page.waitForSelector('#wrh-notes .rn');
const en = await page.locator('#wrh-notes').innerText();
ok('the window opens in English', /What's new/.test(en) && /pouncers/.test(en), en.slice(0, 40));
await page.screenshot({ path: join(out, 'notes_en.png') });
// the language changes while it is open
await page.evaluate(() => {
  document.documentElement.lang = 'tr';
  window.dispatchEvent(new Event('wrh-lang'));
});
const tr = await page.locator('#wrh-notes').innerText();
ok('it switches to Turkish while open', /Yenilikler/.test(tr) && /zıplayan/.test(tr), tr.slice(0, 40));
await page.screenshot({ path: join(out, 'notes_tr.png') });
await page.evaluate(() => {
  document.documentElement.lang = 'de';
  window.dispatchEvent(new Event('wrh-lang'));
});
const de = await page.locator('#wrh-notes').innerText();
ok('German has the newest notes and falls back to English for the rest', /Neuigkeiten/.test(de) && /\(English\)/.test(de));
await page.keyboard.press('Escape');
ok('Escape closes it', (await page.locator('#wrh-notes').count()) === 0);
await page.click('#wrh-version');
await page.mouse.click(5, 650);
ok('a click outside closes it', (await page.locator('#wrh-notes').count()) === 0);
ok('no page errors', errors.length === 0, errors.join(' | '));

// the first start of a new version opens the notes by themselves, once
async function fresh(init) {
  const c = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await c.addInitScript(init);
  const pg = await c.newPage();
  pg.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  pg.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 160)));
  await pg.goto(`${base}/?menu=1`);
  await pg.waitForSelector('.wrh-home', { timeout: 120000 });
  await pg.waitForTimeout(800);
  return { c, pg };
}
{
  const a = await fresh(() => {
    if (!localStorage.getItem('wrh.lang')) {
      localStorage.setItem('wrh.lang', 'en');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 3, bestKills: 40, games: 2, totalKills: 40, acc: 0, color: -1, cls: 0, map: -1, difficulty: 1 }));
      localStorage.setItem('wrh.notesSeen', '0.19');
    }
  });
  ok('a returning player sees the notes open by themselves after an update', (await a.pg.locator('#wrh-notes .rn').count()) === 1, await a.pg.evaluate(() => JSON.stringify({ seen: localStorage.getItem('wrh.notesSeen'), prof: localStorage.getItem('wrh.profile') !== null, menu: !!document.querySelector('.wrh-home') })));
  await a.pg.keyboard.press('Escape');
  await a.pg.reload();
  await a.pg.waitForSelector('.wrh-home', { timeout: 120000 });
  await a.pg.waitForTimeout(800);
  ok('they do not open again on the next start of the same version', (await a.pg.locator('#wrh-notes').count()) === 0);
  await a.pg.click('#wrh-version');
  ok('the version number still opens them', (await a.pg.locator('#wrh-notes .rn').count()) === 1);
  await a.c.close();
  const b = await fresh(() => localStorage.setItem('wrh.lang', 'en'));
  ok('a first-ever visit does not get the history thrown at it', (await b.pg.locator('#wrh-notes').count()) === 0);
  await b.c.close();
}
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
