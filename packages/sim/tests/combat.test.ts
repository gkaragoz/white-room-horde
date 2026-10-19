import { BALANCE, Buttons, ENEMY_TYPES, OBSTACLES, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step } from '../src';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const T = (n: string): number => ENEMY_TYPES.indexOf(n as (typeof ENEMY_TYPES)[number]);

function quiet(seed: number): ReturnType<typeof createWorld> {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0; // the wave spawner stays idle
  return w;
}

describe('grenades', () => {
  it('thrown along the aim, explode after the fuse and kill a cluster', () => {
    const w = quiet(1);
    addPlayer(w, 0, -12, 0);
    const cluster = [];
    for (let i = 0; i < 6; i++) cluster.push(spawnEnemy(w, T('grunt'), -4 + (i % 3) * 0.6, (i >> 1) * 0.6 - 0.6, false));
    for (const c of cluster) w.eCooldown[c] = 1e9;
    step(w, [{ ...NONE, buttons: Buttons.Grenade }]);
    expect(w.pGren[0]).toBe(BALANCE.grenade.max - 1);
    let boom = false;
    for (let t = 0; t < 90 && !boom; t++) {
      step(w, [NONE]);
      boom = w.events.some((e) => e.type === 'explosion');
    }
    expect(boom).toBe(true);
    expect(w.kills).toBeGreaterThanOrEqual(4);
  });

  it('recharges over time and respects the cooldown', () => {
    const w = quiet(2);
    addPlayer(w, 0, 0, 0);
    for (let t = 0; t < 5; t++) step(w, [{ ...NONE, buttons: Buttons.Grenade }]);
    expect(w.pGren[0]).toBe(BALANCE.grenade.max - 1); // cooldown blocks the rest for now
    for (let t = 0; t < BALANCE.grenade.rechargeSeconds * 30 + 5; t++) step(w, [NONE]);
    expect(w.pGren[0]).toBe(BALANCE.grenade.max);
  });
});

describe('cover', () => {
  const box = OBSTACLES[0]!;

  it('stops the player and blocks bullets', () => {
    const w = quiet(3);
    addPlayer(w, 0, box.x, box.y - box.h / 2 - 3, 'ar');
    // walk straight into the box from below
    for (let t = 0; t < 120; t++) step(w, [{ moveX: 0, moveY: 127, aim: 0, buttons: 0 }]);
    expect(w.pY[0]).toBeLessThan(box.y - box.h / 2 + 0.01);
    // enemy behind the box survives fire through it
    const k = spawnEnemy(w, T('tank'), box.x, box.y + box.h / 2 + 2, false);
    w.eCooldown[k] = 1e9;
    const hp = w.eHp[k]!;
    w.pX[0] = box.x;
    w.pY[0] = box.y - box.h / 2 - 1;
    for (let t = 0; t < 30; t++) step(w, [{ ...NONE, aim: Math.round((Math.PI / 2 / (Math.PI * 2)) * 65536), buttons: Buttons.Fire }]);
    expect(w.eHp[k]).toBe(hp);
  });

  it('enemies path around cover to reach the player', () => {
    const w = quiet(4);
    addPlayer(w, 0, box.x, box.y - box.h / 2 - 2.5);
    const k = spawnEnemy(w, T('runner'), box.x, box.y + box.h / 2 + 2.5, false);
    let reached = false;
    for (let t = 0; t < 600 && !reached; t++) {
      step(w, [NONE]);
      const dx = w.eX[k]! - w.pX[0]!;
      const dy = w.eY[k]! - w.pY[0]!;
      reached = w.eActive[k] === 0 || dx * dx + dy * dy < 4;
    }
    expect(reached).toBe(true);
  });
});

describe('enemy abilities', () => {
  it('spitters shoot projectiles that hurt from range', () => {
    const w = quiet(5);
    addPlayer(w, 0, 0, 0);
    const k = spawnEnemy(w, T('spitter'), 6, 0, false);
    w.eCooldown[k] = 0;
    let spat = false;
    let hurt = false;
    for (let t = 0; t < 120 && !hurt; t++) {
      step(w, [NONE]);
      for (const e of w.events) {
        if (e.type === 'spit') spat = true;
        if (e.type === 'playerHit') hurt = true;
      }
    }
    expect(spat).toBe(true);
    expect(hurt).toBe(true);
  });

  it('shielders take much less damage from the front than from behind', () => {
    // the shielder walks toward the nearer player (slot 1, east of it) and so faces east
    const run = (shooter: 0 | 1): number => {
      const w = quiet(6);
      addPlayer(w, 0, -6, 0, 'pistol');
      addPlayer(w, 1, 3, 0, 'pistol');
      const k = spawnEnemy(w, T('shielder'), 0, 0, false);
      w.eCooldown[k] = 1e9;
      const hp = w.eHp[k]!;
      const west = 32768; // aim angle pi
      const inputs: PlayerInput[] = [NONE, NONE];
      inputs[shooter] = { ...NONE, aim: shooter === 1 ? west : 0, buttons: Buttons.Fire };
      step(w, inputs);
      for (let t = 0; t < 10; t++) step(w, [NONE, NONE]);
      return hp - w.eHp[k]!;
    };
    const front = run(1);
    const back = run(0);
    expect(back).toBeGreaterThan(0);
    expect(front).toBeLessThan(back * 0.5);
  });

  it('exploders chain into neighbours', () => {
    const w = quiet(7);
    addPlayer(w, 0, 0, 0);
    const a = spawnEnemy(w, T('exploder'), 5, 0, false);
    const b = spawnEnemy(w, T('grunt'), 5.8, 0, false);
    w.eCooldown[b] = 1e9;
    w.eHp[b] = 10;
    w.eX[a] = 0.9; // touching the player: it blows up next tick
    for (let t = 0; t < 4; t++) step(w, [NONE]);
    expect(w.eActive[a]).toBe(0);
  });
});
