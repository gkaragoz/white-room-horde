import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, MAX_ENEMIES, PlayerState, type PlayerInput } from '@wrh/shared';
import { createGame, step, type World } from '../src';

/**
 * A simple but not stupid player for balance checks: it keeps away from the crowd (a push from every enemy close by, a
 * pull to the middle near the walls), shoots the nearest enemy, throws grenades into thick crowds, takes the first card
 * (a fresh press now and then), goes to helpful pickups and revives a downed friend when it is safe. Humans do better
 * (they kite in loops, pick weapons, dodge telegraphs), so the floor the bots reach is a floor under the real difficulty.
 */
export function botInput(w: World, s: number): PlayerInput {
  const px = w.pX[s]!;
  const py = w.pY[s]!;
  let fx = 0;
  let fy = 0;
  let nearest = -1;
  let nd = 1e9;
  let crowd = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    const dx = w.eX[i]! - px;
    const dy = w.eY[i]! - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd) {
      nd = d2;
      nearest = i;
    }
    if (d2 < 100) {
      const d = Math.sqrt(d2) + 0.5;
      fx -= dx / (d * d);
      fy -= dy / (d * d);
      crowd++;
    }
  }
  // stay off the walls
  const wx = Math.abs(px) / ARENA_HALF_W;
  const wy = Math.abs(py) / ARENA_HALF_H;
  if (wx > 0.8) fx -= Math.sign(px) * (wx - 0.8) * 8;
  if (wy > 0.75) fy -= Math.sign(py) * (wy - 0.75) * 8;
  // dodge the red: leave any charging ground attack that covers us
  for (let t = 0; t < w.tActive.length; t++) {
    if (!w.tActive[t]) continue;
    const dx = px - w.tX[t]!;
    const dy = py - w.tY[t]!;
    const r = w.tShape[t] === 0 ? w.tW[t]! + 1.5 : Math.max(w.tW[t]!, w.tL[t]!) + 1;
    if (dx * dx + dy * dy < r * r) {
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      fx += (dx / d) * 6;
      fy += (dy / d) * 6;
    }
  }
  // a downed friend: go to them when nothing is close
  let revive = false;
  for (let o = 0; o < w.pActive.length; o++) {
    if (o === s || !w.pActive[o] || w.pState[o] !== PlayerState.Downed) continue;
    const dx = w.pX[o]! - px;
    const dy = w.pY[o]! - py;
    if (crowd < 3) {
      fx += dx * 0.05;
      fy += dy * 0.05;
    }
    if (dx * dx + dy * dy < 4) revive = true;
  }
  // pickups
  for (let k = 0; k < w.kActive.length; k++) {
    if (!w.kActive[k]) continue;
    const dx = w.kX[k]! - px;
    const dy = w.kY[k]! - py;
    if (dx * dx + dy * dy < 90 && crowd < 6) {
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      fx += (dx / d) * 0.8;
      fy += (dy / d) * 0.8;
    }
  }
  const len = Math.hypot(fx, fy);
  const mx = len > 0.05 ? Math.round((fx / Math.max(len, 1)) * 127) : 0;
  const my = len > 0.05 ? Math.round((fy / Math.max(len, 1)) * 127) : 0;
  let aim = 0;
  if (nearest >= 0) aim = Math.round((((Math.atan2(w.eY[nearest]! - py, w.eX[nearest]! - px) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 65536) & 0xffff;
  let buttons = nearest >= 0 ? Buttons.Fire : 0;
  if (crowd > 14 && w.tick % 45 === s * 5) buttons |= Buttons.Grenade;
  if (revive) buttons |= Buttons.Revive;
  if (crowd > 6) buttons |= Buttons.Special;
  if (crowd > 8 && w.tick % 60 === s * 7) buttons |= Buttons.Dash;
  if (w.pMag[s]! === 0 && w.tick % 30 === 0) buttons |= Buttons.Reload;
  // cards: a fresh press every other tick
  if (w.pOffer[s * 3]! >= 0 && w.tick % 2 === 0) buttons |= Buttons.Card1 << (w.tick % 3);
  return { moveX: mx, moveY: my, aim, buttons, aimDist: 20, gAim: aim };
}

export interface BotRun {
  floor: number;
  ticks: number;
}

/** Play a squad of bots until everybody is dead (or `maxTicks`). Returns the floor reached. */
export function playBots(seed: number, players = 3, maxTicks = 30 * 60 * 18): BotRun {
  const w = createGame({ seed, players: Array.from({ length: players }, (_, i) => ({ slot: i, weapon: 'pistol' as const, cls: (seed + i * 4) % 9 })) });
  while (!w.gameOver && w.tick < maxTicks) {
    const inputs: PlayerInput[] = [];
    for (let s = 0; s < players; s++) inputs.push(botInput(w, s));
    step(w, inputs);
  }
  void BALANCE;
  return { floor: w.wave, ticks: w.tick };
}
