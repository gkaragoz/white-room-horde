// Companion bots in an online room with two real pages and the local game server:
//  1. the host picks 2 companions in the room, the game starts, both pages see four players and the bots walk in BOTH worlds
//     (the guest only sees what the host's page sends),
//  2. nobody desyncs,
//  3. the host's connection drops: the bots stay in the room and the guest's page takes over driving them (they keep moving),
//  4. the host comes back and gets the role (and the driving) back.
//
//   pnpm --filter @wrh/client build && node tools/ci/bot-online-check.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 19000 + Math.floor(Math.random() * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

const srv = spawn('pnpm', ['--filter', '@wrh/server', 'start'], { shell: true, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server did not start')), 60000);
  srv.stdout.on('data', (d) => {
    if (String(d).includes('white-room-horde server on')) {
      clearTimeout(t);
      resolve();
    }
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(cls) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 240 } });
  await ctx.addInitScript((c) => {
    try {
      localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: c, map: 0, difficulty: 0 }));
      localStorage.setItem('wrh.lang', 'en');
    } catch {}
  }, cls);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/?menu=1`);
  return { page, errors };
}

/** Distance the bots (slots 2 and 3) moved in a page's world over `ms`, and whether they are alive. */
async function walked(page, ms) {
  const read = () => page.evaluate(() => {
    const w = window.__wrh.world;
    return [2, 3].map((s) => ({ x: w.pX[s], y: w.pY[s], active: w.pActive[s], tick: w.tick }));
  });
  const a = await read();
  await sleep(ms);
  const b = await read();
  return a.map((p, i) => ({ moved: Math.hypot(b[i].x - p.x, b[i].y - p.y), active: b[i].active, ticks: b[i].tick - p.tick }));
}

let failed = false;
try {
  const host = await open(0);
  await host.page.waitForSelector('#wrh-host', { timeout: 60000, state: 'attached' });
  await host.page.click('#wrh-card-play');
  await host.page.click('#wrh-online');
  await host.page.click('#wrh-host');
  await host.page.waitForFunction(() => window.__wrh?.session?.code, null, { timeout: 30000 });
  const code = await host.page.evaluate(() => window.__wrh.session.code);
  const guest = await open(1);
  await guest.page.waitForSelector('#wrh-join', { timeout: 90000, state: 'attached' });
  await guest.page.click('#wrh-card-play');
  await guest.page.click('#wrh-online');
  await guest.page.fill('#wrh-code', code);
  await guest.page.click('#wrh-join');
  await sleep(1500);
  await host.page.waitForSelector('[data-ccount="2"]', { timeout: 30000 });
  await host.page.click('[data-ccount="2"]');
  await host.page.click('[data-cskill="normal"]');
  await sleep(1500);
  const lobby = await guest.page.evaluate(() => window.__wrh.session.players.map((p) => ({ slot: p.slot, bot: !!p.bot, name: p.name, connected: p.connected })));
  check('the guest sees two bots in the room list', lobby.filter((p) => p.bot).length === 2 && lobby.length === 4, JSON.stringify(lobby));
  const rows = await guest.page.evaluate(() => document.querySelectorAll('#wrh-plist .wrh-botrow').length);
  check('and the player list marks them as bots', rows === 2, `${rows} rows`);
  const guestPicker = await guest.page.evaluate(() => !!document.querySelector('#wrh-comp'));
  check('only the host has the Companions picker', !guestPicker);
  await host.page.click('#wrh-start');
  for (const p of [host.page, guest.page]) await p.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 60, null, { timeout: 90000 });
  await sleep(1500);
  const roles = await Promise.all([host.page, guest.page].map((p) => p.evaluate(() => window.__wrh.session.drivesBots)));
  check('only the host drives the bots', roles[0] === true && roles[1] === false, JSON.stringify(roles));
  const names = await guest.page.evaluate(() => [2, 3].map((s) => window.__wrh.names[s]));
  check('the bots have names in the game', names.every((n) => typeof n === 'string' && n.length > 0), names.join(', '));

  // ---- 1. the bots walk in both worlds
  const [h1, g1] = await Promise.all([walked(host.page, 10000), walked(guest.page, 10000)]);
  check('the bots move in the host world', h1.every((b) => b.active && b.moved > 0.5), JSON.stringify(h1));
  check('the bots move in the guest world (driven by the host only)', g1.every((b) => b.active && b.moved > 0.5), JSON.stringify(g1));
  const desync = await Promise.all([host.page, guest.page].map((p) => p.evaluate(() => window.__wrh.session.desyncTicks.length)));
  check('no desync with bots in the room', desync[0] === 0 && desync[1] === 0, JSON.stringify(desync));

  // ---- 2. the host's connection drops: the guest takes the bots over
  await host.page.evaluate(() => {
    window.__wrh.ws.close();
  });
  await guest.page.waitForFunction(() => window.__wrh.session.drivesBots === true, null, { timeout: 20000 }).catch(() => {});
  const takeover = await guest.page.evaluate(() => ({ drives: window.__wrh.session.drivesBots, bots: window.__wrh.session.players.filter((p) => p.bot).length }));
  check('the guest becomes the host and drives the bots', takeover.drives && takeover.bots === 2, JSON.stringify(takeover));
  await sleep(3000);
  const g2 = await walked(guest.page, 10000);
  check('the bots keep moving after the host dropped', g2.every((b) => b.active && b.moved > 0.5), JSON.stringify(g2));

  // ---- 3. the old host returns and gets the role back
  await host.page.waitForFunction(() => window.__wrh.session?.adopted === true, null, { timeout: 40000 }).catch(() => {});
  await sleep(4000);
  const back = await host.page.evaluate(() => ({ drives: window.__wrh.session.drivesBots, slot: window.__wrh.session.slot, host: window.__wrh.session.players.find((p) => p.slot === window.__wrh.session.slot)?.host }));
  check('the returning host has the role and the bots again', back.slot === 0 && back.host === true && back.drives === true, JSON.stringify(back));
  const g3 = await walked(guest.page, 8000);
  check('the bots still move after the host returned', g3.every((b) => b.active && b.moved > 0.5), JSON.stringify(g3));
  const desync2 = await Promise.all([host.page, guest.page].map((p) => p.evaluate(() => window.__wrh.session.desyncTicks.length)));
  check('still no desync', desync2[0] === 0 && desync2[1] === 0, JSON.stringify(desync2));
  check('no page errors', host.errors.length === 0 && guest.errors.length === 0, [...host.errors, ...guest.errors].slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  script error: ' + (e?.stack ?? e));
  failed = true;
}
await browser.close();
srv.kill();
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(srv.pid), '/t', '/f'], { shell: true });
const bad = results.filter((r) => !r.ok).length;
console.log(bad || failed ? `${bad} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
