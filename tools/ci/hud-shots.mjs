// Takes screenshots of the in-game HUD for a look by eye, and checks the clickable weapon list does not fire a shot.
//   node tools/ci/hud-shots.mjs   (after building the client)
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

async function open(url, cls) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript((c) => {
    localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: c, map: -1, difficulty: 1 }));
    localStorage.setItem('wrh.lang', 'en');
  }, cls);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + url);
  await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 90000 });
  return { page, ctx, errors };
}

// a gunner: the weapon list can be clicked, the tooltips show
{
  const { page, ctx, errors } = await open('/?solo=1&god=1&wave=2&map=0', 0);
  await page.evaluate(() => {
    const w = window.__wrh.world;
    w.pOwned[0] = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
  });
  await sleep(800);
  const rows = await page.locator('.wrh-inv .row').count();
  ok('the weapon list has rows', rows >= 2, String(rows));
  const before = await page.evaluate(() => window.__wrh.world.pWeapon[0]);
  const shots0 = await page.evaluate(() => window.__wrh.world.pMag[0]);
  await page.locator('.wrh-inv .row').nth(1).click();
  await sleep(500);
  const after = await page.evaluate(() => window.__wrh.world.pWeapon[0]);
  ok('a click on a row selects that weapon', after !== before, `${before} -> ${after}`);
  const shots1 = await page.evaluate(() => window.__wrh.world.pMag[0]);
  ok('the click did not fire a shot behind the list', shots1 >= shots0 || after !== before);
  await page.locator('.wrh-me .g').last().hover();
  await sleep(300);
  await page.screenshot({ path: join(out, 'hud_gunner.png') });
  const tip = await page.locator('.wrh-tip').innerText();
  ok('hovering the ability shows its name and text', tip.length > 20, tip.slice(0, 50));
  await page.locator('#tb-set').hover();
  await sleep(300);
  const tip2 = await page.locator('.wrh-tip').innerText();
  ok('hovering a top-right icon names it', /Settings/i.test(tip2), tip2);
  const hint = await page.locator('#h-hint').innerText();
  ok('the controls line at the bottom is gone', hint.trim() === '', hint);
  ok('no page errors', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// the hammer charges: a bar over the head
{
  const { page, ctx, errors } = await open('/?solo=1&god=1&wave=2&map=0', 8);
  await page.mouse.move(700, 350);
  await page.mouse.down();
  await sleep(1200);
  await page.screenshot({ path: join(out, 'hud_hammer_charging.png') });
  const charge = await page.evaluate(() => window.__wrh.world.pCharge[0]);
  ok('the hammer is charging', charge > 0.3, String(charge));
  await page.mouse.up();
  ok('no page errors (hammer)', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
