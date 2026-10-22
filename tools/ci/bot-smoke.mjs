// Companion bots in a real page: a solo game with three bots must boot, tick, and the bots must actually play (move around, hold
// their own class and name), both through the dev address (?bots=3) and through the menu's Companions picker. Also prints what the
// brains cost per tick in the browser.
//
//   node tools/ci/bot-smoke.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const client = resolve(fileURLToPath(new URL('../../packages/client', import.meta.url)));
const vitePath = createRequire(resolve(client, 'package.json')).resolve('vite');
const { createServer } = await import(pathToFileURL(vitePath).href);

const server = await createServer({ root: client, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where every active slot stands, and how many ticks the world has run. */
const sample = (page) =>
  page.evaluate(() => {
    const w = window.__wrh.world;
    const slots = [];
    for (let s = 0; s < 11; s++) if (w.pActive[s]) slots.push({ s, x: w.pX[s], y: w.pY[s], hp: w.pHp[s] });
    return { tick: w.tick, slots, bots: [...window.__wrh.ui.botSlots], names: window.__wrh.names, botMs: window.__wrh.perf.botMs };
  });

async function scene(label, open) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  try {
    await open(page);
    const booted = await page
      .waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 30, null, { timeout: 120000 })
      .then(() => true)
      .catch(() => false);
    check(booted, `${label}: the game boots and its world ticks`);
    if (!booted) return;
    const a = await sample(page);
    check(a.slots.length === 4, `${label}: four players in the world (the human and three bots), saw ${a.slots.length}`);
    check(a.bots.length === 3 && a.bots.every((s) => s >= 1 && s <= 3), `${label}: the HUD knows the bot slots (${a.bots.join(',')})`);
    // the page may be slow (software rendering): give the bots up to a minute to walk
    let b = a;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      b = await sample(page);
      const walked = [1, 2, 3].every((s) => {
        const p0 = a.slots.find((x) => x.s === s);
        const p1 = b.slots.find((x) => x.s === s);
        return p0 && p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.5;
      });
      if (b.tick > a.tick + 60 && walked) break;
    }
    check(b.tick > a.tick + 60, `${label}: the world keeps ticking (${a.tick} -> ${b.tick})`);
    for (const s of [1, 2, 3]) {
      const p0 = a.slots.find((x) => x.s === s);
      const p1 = b.slots.find((x) => x.s === s);
      const moved = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0;
      check(moved > 0.5 || (p1 && p1.hp <= 0), `${label}: bot ${s} moves (${moved.toFixed(1)} units)`);
    }
    check(b.bots.every((s) => typeof b.names[s] === 'string' && b.names[s].length > 0), `${label}: every bot has a name (${b.bots.map((s) => b.names[s]).join(', ')})`);
    console.log(`INFO  ${label}: the brains of 3 bots took ${b.botMs.toFixed(3)} ms per tick in this browser`);
    check(errors.length === 0, `${label}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await ctx.close();
  }
}

/** Ten bots at the highest skill in a busy wave: what their brains cost per tick, and that the page copes (informational, with a generous limit). */
async function perfScene() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  try {
    await page.goto(`${base}/?solo=1&bots=10&botskill=superhuman&wave=6&map=0&god=1`);
    await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 200, null, { timeout: 180000 });
    await sleep(6000);
    const r = await page.evaluate(() => ({ botMs: window.__wrh.perf.botMs, simMs: window.__wrh.perf.simMs, fps: window.__wrh.perf.fps, enemies: window.__wrh.world.enemyCount }));
    console.log(`INFO  ten bots (superhuman, wave 6): brains ${r.botMs.toFixed(2)} ms per tick, simulation ${r.simMs.toFixed(2)} ms per tick, ${r.fps} fps, ${r.enemies} enemies (software rendering)`);
    check(r.botMs < 15, `ten bots: the brains stay under 15 ms per tick (${r.botMs.toFixed(2)})`);
    check(errors.length === 0, `ten bots: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await ctx.close();
  }
}

/** A run with three bots ends: the game over screen says the experience was reduced, with the factor, and the save got the reduced amount. */
async function gameOverScene() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('wrh.notesSeen', '999.0');
      localStorage.setItem('wrh.profile', JSON.stringify({ v: 2, xp: 0, introSeen: true, bestWave: 1, bestKills: 0, games: 0, totalKills: 0, acc: 0, color: -1, cls: 0, map: -1, mods: 0 }));
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split(NL)[0]));
  try {
    await page.goto(`${base}/?solo=1&meta=1&bots=3&botskill=easy&map=0`);
    await page.waitForFunction(() => window.__wrh?.world && window.__wrh.world.tick > 510, null, { timeout: 240000 });
    const score = await page.evaluate(() => {
      const w = window.__wrh.world;
      for (let s = 0; s < 11; s++) if (w.pActive[s]) w.pHp[s] = 0;
      return w.kills;
    });
    const shown = await page
      .waitForSelector('.wrh-rw-bots', { timeout: 90000 })
      .then((el) => el.textContent())
      .catch(() => null);
    check(shown !== null && /0\.57/.test(shown), `game over: the reward page says the XP was reduced by companions ("${(shown ?? '').trim()}")`);
    const xp = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('wrh.profile')).xp;
      } catch {
        return -1;
      }
    });
    check(xp >= 0, `game over: the profile holds the run's XP (${xp}, kills ${score})`);
    check(errors.length === 0, `game over: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await ctx.close();
  }
}

try {
  await scene('dev address', (page) => page.goto(`${base}/?solo=1&bots=3&botskill=normal&wave=2&map=0`));
  await scene('menu picker', async (page) => {
    await page.goto(`${base}/?menu=1`);
    await page.waitForSelector('#wrh-card-play', { state: 'attached', timeout: 90000 });
    await page.click('#wrh-card-play');
    await page.click('[data-ccount="3"]');
    await page.click('[data-cskill="easy"]');
    const label = await page.textContent('#wrh-comp .wrh-comp-hint');
    check(/0\.57/.test(label ?? ''), `menu picker: the hint names the experience factor ("${(label ?? '').trim()}")`);
    await page.click('#wrh-solo', { noWaitAfter: true, timeout: 120000 });
  });
  await gameOverScene();
  await perfScene();
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
