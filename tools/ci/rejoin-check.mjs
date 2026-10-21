// Online resilience check with two real pages and the local game server:
//  1. the host pauses for a few seconds and resumes: nobody's connection is cut by the silence watchdog (no new socket),
//  2. a dropped connection is re-established in the SAME world (no replay from tick 0, the slot known at once, same tick as the host),
//  3. a reloaded page (F5) returns to the running game with its "return to the game" button.
//
//   pnpm --filter @wrh/client build && node tools/ci/rejoin-check.mjs
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
  const sockets = { n: 0 };
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('websocket', () => sockets.n++);
  await page.goto(`http://127.0.0.1:${PORT}/?menu=1`);
  return { page, errors, sockets };
}

let failed = false;
try {
  const host = await open(0);
  await host.page.waitForSelector('#wrh-host', { timeout: 60000, state: 'attached' });
  await host.page.click('#wrh-online');
  await host.page.click('#wrh-host');
  await host.page.waitForFunction(() => window.__wrh?.session?.code, null, { timeout: 30000 });
  const code = await host.page.evaluate(() => window.__wrh.session.code);
  const guest = await open(1);
  await guest.page.waitForSelector('#wrh-join', { timeout: 90000, state: 'attached' });
  await guest.page.click('#wrh-online');
  await guest.page.fill('#wrh-code', code);
  await guest.page.click('#wrh-join');
  await sleep(1500);
  await host.page.click('#wrh-start');
  for (const p of [host.page, guest.page]) await p.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 60, null, { timeout: 90000 });
  await sleep(2000);

  const beforePause = await (async () => {
    const mag0 = await guest.page.evaluate(() => window.__wrh.world.pMag[window.__wrh.session.slot]);
    await guest.page.mouse.move(200, 90);
    await guest.page.mouse.down();
    await guest.page.keyboard.down('Space');
    await sleep(1200);
    await guest.page.keyboard.up('Space');
    await guest.page.mouse.up();
    await sleep(2000);
    const st = await guest.page.evaluate(() => ({ mag: window.__wrh.world.pMag[window.__wrh.session.slot], reload: window.__wrh.world.pReload[window.__wrh.session.slot] }));
    return { mag0, ...st, fired: st.mag < mag0 || st.reload > 0 };
  })();
  check('the guest can fire before the pause (the check itself works)', beforePause.fired, JSON.stringify(beforePause));

  // ---- 1. a dropped connection continues in the same world (first, while the squad is still alive: a finished game does not reconnect)
  await guest.page.evaluate(() => {
    window.__keep = window.__wrh.world;
    window.__wrh.ws.close(); // the page reconnects by itself
  });
  await guest.page.waitForFunction(() => window.__wrh.session?.adopted === true, null, { timeout: 30000 }).catch(() => {});
  await sleep(3500);
  const re = await guest.page.evaluate(() => ({ same: window.__wrh.world === window.__keep, adopted: window.__wrh.session.adopted, slot: window.__wrh.session.slot, tick: window.__wrh.world.tick, backlog: window.__wrh.session.backlog, desyncs: window.__wrh.session.desyncTicks.length }));
  const hostTick = await host.page.evaluate(() => window.__wrh.world.tick);
  check('the page carried on in the same world with its slot', re.same && re.adopted && re.slot === 1, JSON.stringify(re));
  check('and it is level with the host (no replay from tick 0)', Math.abs(re.tick - hostTick) < 90 && re.backlog < 120, `guest ${re.tick}, host ${hostTick}, backlog ${re.backlog}`);
  check('no desync after the reconnect', re.desyncs === 0);

  // ---- 2. pause and resume
  const sockHost = host.sockets.n;
  const sockGuest = guest.sockets.n;
  await host.page.evaluate(() => window.__wrh.session.setPause(true));
  await sleep(12000); // longer than the 10 s after which a page's input tags used to run out of the relay's reach for good
  const pausedSeen = await guest.page.evaluate(() => window.__wrh.session.paused);
  check('the guest sees the pause', pausedSeen === true);
  const tPaused = await guest.page.evaluate(() => window.__wrh.world.tick);
  await host.page.evaluate(() => window.__wrh.session.setPause(false));
  await sleep(3500);
  const tAfter = await guest.page.evaluate(() => window.__wrh.world.tick);
  check('the game runs again after the resume', tAfter - tPaused > 60, `${tAfter - tPaused} ticks`);
  check('no connection was cut by the watchdog (no new socket on either page)', host.sockets.n === sockHost && guest.sockets.n === sockGuest, `host +${host.sockets.n - sockHost}, guest +${guest.sockets.n - sockGuest}`);
  // everybody can still act: the guest holds the fire button and its magazine moves (or it reloads), the world sees real input again
  const fireTest = async () => {
    const mag0 = await guest.page.evaluate(() => window.__wrh.world.pMag[window.__wrh.session.slot]);
    await guest.page.mouse.move(200, 90);
    await guest.page.mouse.down();
    await guest.page.keyboard.down('Space');
    await sleep(1200);
    await guest.page.keyboard.up('Space');
    await guest.page.mouse.up();
    await sleep(2000); // the confirmed world trails real time on a software renderer
    const st = await guest.page.evaluate(() => ({ mag: window.__wrh.world.pMag[window.__wrh.session.slot], reload: window.__wrh.world.pReload[window.__wrh.session.slot], state: window.__wrh.world.pState[window.__wrh.session.slot], away: window.__wrh.world.pAway[window.__wrh.session.slot], ahead: window.__wrh.session.sentTick - window.__wrh.session.received, lead: window.__wrh.session.lead }));
    return { mag0, ...st, fired: st.mag < mag0 || st.reload > 0 };
  };
  const afterPause = await fireTest();
  // a player the horde has already downed cannot shoot whatever the network does: then only the input path is judged (below)
  check('after the long pause the guest can fire again', afterPause.fired || afterPause.state !== 0, JSON.stringify(afterPause));
  check('and its input tags are where the relay can use them', afterPause.away === 0 && afterPause.ahead <= afterPause.lead + 4, `ahead ${afterPause.ahead}, lead ${afterPause.lead}`);

  // ---- 3. F5 and "return to the game"
  await guest.page.reload();
  await guest.page.waitForSelector('#wrh-rejoin', { timeout: 90000 });
  check('the menu offers the way back after a reload', true);
  await guest.page.click('#wrh-rejoin');
  await guest.page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30 && window.__wrh.session?.slot === 1, null, { timeout: 90000 }).catch(() => {});
  // a page that starts from nothing replays the game so far: give it up to a minute (a software renderer is slow) to be level again
  let back = { has: false, slot: -1, tick: 0, catching: true };
  let hostTick2 = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    back = await guest.page.evaluate(() => ({ has: !!window.__wrh.world, slot: window.__wrh.session?.slot, tick: window.__wrh.world?.tick ?? 0, catching: window.__wrh.session?.catchingUp }));
    hostTick2 = await host.page.evaluate(() => window.__wrh.world.tick);
    if (back.has && !back.catching && Math.abs(back.tick - hostTick2) < 150) break;
  }
  check('the reloaded page is back in the running game', back.has && back.slot === 1 && Math.abs(back.tick - hostTick2) < 150, JSON.stringify({ ...back, hostTick2 }));
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
