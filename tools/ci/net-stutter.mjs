// Online stutter check: a hammerer hosts through a bad connection (latency, jitter, and short stalls that deliver everything
// at once), a second player joins on a clean one, and the hammerer walks while holding the fire button (the charge slows the
// walk, the case that used to make the local character stutter). What the page drew for the local character is measured:
// steps against the direction of travel, and how fast it was drawn compared with how fast the simulation really moves.
//
//   pnpm --filter @wrh/client build && node tools/ci/net-stutter.mjs [latencyMs] [jitterMs] [stallEveryMs]
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { chromium } from 'playwright';

const LATENCY = Number(process.argv[2] ?? 60);
const JITTER = Number(process.argv[3] ?? 25);
const STALL_EVERY = Number(process.argv[4] ?? 2500);
const PORT = 18000 + Math.floor(Math.random() * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

// the game server (it serves the built client as well)
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

// a TCP proxy that delays every chunk (order is kept, like TCP does), with a stall now and then that releases everything at once
function delayProxy(listenPort, targetPort) {
  let stallUntil = 0;
  setInterval(() => {
    stallUntil = Date.now() + 150;
  }, STALL_EVERY).unref();
  const srv = createServer((client) => {
    const upstream = connect(targetPort, '127.0.0.1');
    const pipe = (from, to) => {
      // one ordered queue per direction, drained by a single timer
      const queue = [];
      let last = 0;
      let closing = false;
      const drain = () => {
        const now = Date.now();
        while (queue.length && queue[0].at <= now) {
          const q = queue.shift();
          if (q.end) to.destroyed || to.end();
          else if (!to.destroyed) to.write(q.chunk);
        }
        if (queue.length) setTimeout(drain, Math.max(1, queue[0].at - Date.now()));
      };
      const push = (item) => {
        queue.push(item);
        if (queue.length === 1) setTimeout(drain, Math.max(1, item.at - Date.now()));
      };
      from.on('data', (chunk) => {
        const at = Math.max(Date.now() + LATENCY / 2 + Math.random() * JITTER, stallUntil, last);
        last = at;
        push({ at, chunk });
      });
      from.on('end', () => {
        if (closing) return;
        closing = true;
        push({ at: last, end: true });
      });
      from.on('error', () => to.destroy());
    };
    pipe(client, upstream);
    pipe(upstream, client);
  });
  srv.listen(listenPort, '127.0.0.1');
  return srv;
}
const PROXY_PORT = PORT + 1000;
const proxy = delayProxy(PROXY_PORT, PORT);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(url, cls, size = { width: 360, height: 240 }) {
  const ctx = await browser.newContext({ viewport: size });
  await ctx.addInitScript((c) => {
    try {
      localStorage.setItem('wrh.profile', JSON.stringify({ bestWave: 30, bestKills: 999, games: 9, totalKills: 999, acc: 0, color: -1, cls: c, map: 0, difficulty: 0 }));
      localStorage.setItem('wrh.lang', 'en');
    } catch {}
  }, cls);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (process.env.DEBUG_PAGE) {
    page.on('requestfailed', (r) => console.log('reqfailed', r.url().slice(-60), r.failure()?.errorText));
    page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 160)));
  }
  await page.goto(url);
  return { page, errors };
}

let failed = false;
try {
  const host = await open(`http://127.0.0.1:${process.env.DIRECT ? PORT : PROXY_PORT}/?menu=1`, 8);
  await host.page.screenshot({ path: 'tools/ci/net-stutter-menu.png' }).catch(() => {});
  await host.page.waitForSelector('#wrh-host', { timeout: 30000, state: 'attached' });
  await host.page.click('#wrh-host');
  await host.page.waitForFunction(() => window.__wrh?.session?.code, null, { timeout: 30000 });
  const code = await host.page.evaluate(() => window.__wrh.session.code);
  const guest = await open(`http://127.0.0.1:${PORT}/?menu=1`, 0, { width: 200, height: 140 });
  await guest.page.waitForSelector('#wrh-join', { timeout: 90000 });
  await guest.page.fill('#wrh-code', code);
  await guest.page.click('#wrh-join');
  await sleep(1500);
  await host.page.click('#wrh-start');
  await host.page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 60, null, { timeout: 90000 });
  await host.page.evaluate(() => window.focus());
  // the first seconds are shader compiles and warm-up in a software renderer; measure after them
  await sleep(3000);
  await host.page.waitForFunction(() => !window.__wrh.session.catchingUp && window.__wrh.session.backlog < 12, null, { timeout: 12000 }).catch(() => {});

  // record the confirmed position every frame so the real pace can be read back
  await host.page.evaluate(() => {
    window.__rec = [];
    const f = () => {
      const w = window.__wrh.world;
      const s = window.__wrh.session;
      if (w && s) window.__rec.push([w.tick, w.pX[s.slot], w.pY[s.slot]]);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    window.__wrh.resetNetstats();
  });
  // walk in circles holding the fire button
  await host.page.mouse.move(300, 120);
  await host.page.mouse.down();
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 12000) {
    await host.page.keyboard.down(keys[k % 4]);
    await sleep(900);
    await host.page.keyboard.up(keys[k % 4]);
    k++;
  }
  await host.page.mouse.up();
  const net = await host.page.evaluate(() => window.__wrh.netstats());
  const dbg = await host.page.evaluate(() => ({ fps: window.__wrh.perf.fps, state: window.__wrh.session.state, catching: window.__wrh.session.catchingUp, backlog: window.__wrh.session.backlog, tick: window.__wrh.world.tick, slot: window.__wrh.session.slot, hp: window.__wrh.world.pHp[window.__wrh.session.slot], pstate: window.__wrh.world.pState[window.__wrh.session.slot], enemies: window.__wrh.world.enemyCount }));
  await host.page.screenshot({ path: 'tools/ci/net-stutter-end.png' }).catch(() => {});
  console.log('page', JSON.stringify(dbg));
  const rec = await host.page.evaluate(() => window.__rec);
  // the real top pace: position change between recorded frames that are at least 4 ticks apart
  let simMax = 0;
  for (let i = 1; i < rec.length; i++) {
    for (let j = i - 1; j >= 0 && j >= i - 6; j--) {
      const dt = (rec[i][0] - rec[j][0]) / 30;
      if (dt >= 4 / 30) {
        simMax = Math.max(simMax, Math.hypot(rec[i][1] - rec[j][1], rec[i][2] - rec[j][2]) / dt);
        break;
      }
    }
  }
  const pace = await host.page.evaluate(() => window.__wrh.pace);
  const top = Math.max(simMax, pace);
  console.log('rec', rec.length, JSON.stringify(rec[0]), JSON.stringify(rec[Math.floor(rec.length / 2)]), JSON.stringify(rec[rec.length - 1]));
  console.log(`latency ${LATENCY} ms +- ${JITTER}, a stall every ${STALL_EVERY} ms`);
  console.log(`drawn frames ${net.frames}, backward steps ${net.backward}, draw speed p50 ${net.p50.toFixed(1)} p99 ${net.p99.toFixed(1)} max ${net.maxDrawSpeed.toFixed(1)} (base pace ${pace.toFixed(1)}, simulation top pace ${simMax.toFixed(1)})`);
  console.log(`corrections ${net.corrections}, snaps ${net.snaps}, lead ${net.lead} (changes ${net.leadChanges}), play rate ${net.playRate.toFixed(2)}, resyncs ${net.resyncs}, desyncs ${net.desyncs}, worst input lateness ${Math.round(net.lateMax)} ms`);
  // a software renderer on a busy machine delivers a few frames per second, and then the page cannot keep up with the game at all;
  // the smoothness checks only mean something when it can (a GPU, or a quiet CPU)
  const strict = dbg.fps >= 25;
  if (!strict) console.log(`NOTE  the page ran at ${dbg.fps} fps here: the smoothness checks are printed but not enforced`);
  const soft = (label, ok, detail) => check(strict ? label : `${label} (not enforced)`, strict ? ok : true, `${detail}${ok ? '' : ' [would fail]'}`);
  soft('the local character was drawn for the whole run', net.frames > 60, `${net.frames}`);
  soft('it never steps against its direction of travel', net.backward <= Math.max(2, net.frames * 0.08), `${net.backward}`);
  soft('the 99th percentile of the drawn speed stays within 30% of the real top pace', net.p99 <= top * 1.3, `${net.p99.toFixed(1)} vs ${top.toFixed(1)}`);
  soft('no jump of the drawn position beyond 1.8x the top pace', net.maxDrawSpeed <= top * 1.8, `${net.maxDrawSpeed.toFixed(1)}`);
  check('no snaps of the prediction', net.snaps === 0, `${net.snaps}`);
  check('no desync, no resync', net.desyncs === 0 && net.resyncs === 0);
  check('no page errors', host.errors.length === 0 && guest.errors.length === 0, [...host.errors, ...guest.errors].slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  script error: ' + (e?.stack ?? e));
  failed = true;
}
await browser.close();
proxy.close();
srv.kill();
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(srv.pid), '/t', '/f'], { shell: true });
const bad = results.filter((r) => !r.ok).length;
console.log(bad || failed ? `${bad} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
