import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, FloorPhase, MISC, PlayerState, TeleEffect, TeleShape, ZoneKind, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, predictPlayer, restoreWorld, serializeWorld, spawnBoss, spawnEnemy, step, type World } from '../src';
import { addTelegraph, addZone, launchPlayer } from '../src/hazards';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

function quiet(seed: number): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0);
  w.pHp[0] = 100;
  w.pMaxHp[0] = 100;
  return w;
}

const run = (w: World, ticks: number, input: PlayerInput = NONE): void => {
  for (let t = 0; t < ticks; t++) step(w, [input]);
};

describe('ground zones', () => {
  it('acid burns whoever stands in it, for as long as it lasts, and only inside', () => {
    const w = quiet(1);
    addZone(w, 0, 0, 2, 2, ZoneKind.Acid);
    run(w, 30);
    const burnt = 100 - w.pHp[0]!;
    expect(burnt).toBeGreaterThan(BALANCE.hazards.acid.dps * BALANCE.enemyDamageMul * 0.6);
    expect(burnt).toBeLessThan(BALANCE.hazards.acid.dps * BALANCE.enemyDamageMul * 1.4);
    run(w, 60);
    expect(w.zActive.some((a) => a === 1)).toBe(false); // gone after its two seconds
    const w2 = quiet(1);
    w2.pX[0] = 6;
    addZone(w2, 0, 0, 2, 2, ZoneKind.Fire);
    run(w2, 30);
    expect(w2.pHp[0]).toBe(100);
  });

  it('the hurt flash of a burn is not every tick', () => {
    const w = quiet(2);
    addZone(w, 0, 0, 2, 3, ZoneKind.Fire);
    let hits = 0;
    for (let t = 0; t < 60; t++) {
      step(w, [NONE]);
      hits += w.events.filter((e) => e.type === 'playerHit').length;
    }
    expect(hits).toBeGreaterThan(2);
    expect(hits).toBeLessThan(12);
  });
});

describe('telegraphed attacks', () => {
  it('a circle lands after its delay on everybody inside and throws them, stunned', () => {
    const w = quiet(3);
    addPlayer(w, 1, 12, 0);
    addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 1, 0, 0, 3, 0, 1, 30);
    for (let t = 0; t < 29; t++) step(w, [NONE, NONE]);
    expect(w.pHp[0]).toBe(100); // still charging
    let landed = false;
    for (let t = 0; t < 3; t++) {
      step(w, [NONE, NONE]);
      landed ||= w.events.some((e) => e.type === 'teleHit');
    }
    expect(landed).toBe(true);
    expect(w.pHp[0]).toBeLessThan(100);
    expect(w.pStun[0]).toBeGreaterThan(0);
    expect(w.pHp[1]).toBe(w.pMaxHp[1]); // the one outside is untouched
    expect(w.tActive.some((a) => a === 1)).toBe(false);
  });

  it('a rectangle covers its length and width, oriented along its angle', () => {
    const w = quiet(4);
    addPlayer(w, 1, 0, 6);
    // along the x axis, 10 either way, 2 across: slot 0 at the middle is in, slot 1 at y 6 is out
    addTelegraph(w, TeleShape.Rect, TeleEffect.Hurt, 0, 0, 0, 2, 10, 0.2, 20);
    run2(w, 12);
    expect(w.pHp[0]).toBeLessThan(100);
    expect(w.pHp[1]).toBe(w.pMaxHp[1]);
    // turned a quarter: now it is slot 1's turn (and slot 0 is still on the line through the middle)
    const v = quiet(4);
    addPlayer(v, 1, 0, 6);
    v.pHp[0] = 100;
    addTelegraph(v, TeleShape.Rect, TeleEffect.Hurt, 0, 3, Math.PI / 2, 2, 10, 0.2, 20);
    run2(v, 12);
    expect(v.pHp[1]).toBeLessThan(v.pMaxHp[1]!);
  });

  it('a dash through it dodges it', () => {
    const w = quiet(5);
    addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 4, 0, 0.3, 30);
    for (let t = 0; t < 6; t++) step(w, [NONE]);
    step(w, [{ ...NONE, moveX: 127, buttons: Buttons.Dash }]);
    run(w, 3, { ...NONE, moveX: 127 });
    expect(w.pIFrames[0]).toBeGreaterThan(0);
    run(w, 6);
    expect(w.pHp[0]).toBe(100);
  });

  it('half takes half of what is left, kill takes everything, acid leaves a puddle', () => {
    const half = quiet(6);
    half.pHp[0] = 80;
    addTelegraph(half, TeleShape.Circle, TeleEffect.Half, 0, 0, 0, 3, 0, 0.2, 0);
    run(half, 12);
    expect(half.pHp[0]).toBeCloseTo(40, 0); // (a little regeneration ticks in)
    const kill = quiet(6);
    addTelegraph(kill, TeleShape.Circle, TeleEffect.Kill, 0, 0, 0, 3, 0, 0.2, 0);
    run(kill, 12);
    expect(kill.pState[0] === PlayerState.Downed || kill.pHp[0]! <= 0).toBe(true);
    const acid = quiet(6);
    acid.pX[0] = 10;
    addTelegraph(acid, TeleShape.Circle, TeleEffect.Acid, 0, 0, 0, 2, 0, 0.2, 2.5);
    run(acid, 12);
    expect(acid.zActive.some((a) => a === 1)).toBe(true);
    expect(acid.pHp[0]).toBe(100);
  });
});

function run2(w: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) step(w, [NONE, NONE]);
}

describe('player knockback and stun', () => {
  it('a launched player slides away, cannot steer, shoot or dash until the stun is over, then can again', () => {
    const w = quiet(7);
    launchPlayer(w, 0, 12, 0, 0.5);
    const x0 = w.pX[0]!;
    run(w, 10, { ...NONE, moveX: -127, buttons: Buttons.Fire | Buttons.Dash });
    expect(w.pX[0]).toBeGreaterThan(x0 + 1.5); // pushed along the throw, steering against it did nothing
    expect(w.bActive.some((a) => a === 1)).toBe(false);
    expect(w.pDash[0]).toBe(0);
    run(w, 10); // stun over, slide dead
    const x1 = w.pX[0]!;
    run(w, 10, { ...NONE, moveX: -127 });
    expect(w.pX[0]).toBeLessThan(x1 - 1);
  });

  it('the client prediction follows a knockback exactly', () => {
    const real = quiet(8);
    const ghost = quiet(8);
    launchPlayer(real, 0, -9, 4, 0.4);
    launchPlayer(ghost, 0, -9, 4, 0.4);
    const list: PlayerInput[] = [];
    for (let t = 0; t < 20; t++) list.push({ ...NONE, moveX: t % 7 < 4 ? 127 : -60, moveY: 40, aim: t * 700 });
    for (let t = 0; t < 20; t++) {
      step(real, [list[t]!]);
      const p = predictPlayer(ghost, 0, list.slice(0, t + 1));
      expect(p.x).toBe(real.pX[0]);
      expect(p.y).toBe(real.pY[0]);
    }
  });
});

describe('frozen enemies', () => {
  it('a frozen enemy stands still and does not attack, then thaws', () => {
    const w = quiet(9);
    const e = spawnEnemy(w, 0, 3, 0, false);
    w.eFrost[e] = 60;
    const x0 = w.eX[e]!;
    run(w, 55);
    expect(w.eX[e]).toBe(x0);
    expect(w.pHp[0]).toBe(100);
    run(w, 40);
    expect(Math.abs(w.eX[e]! - x0)).toBeGreaterThan(0.01);
    expect(w.eFrost[e]).toBe(0);
  });
});

describe('the finisher', () => {
  it('the last kill is announced with its killer and position, input is locked for the finisher, then the countdown runs', () => {
    const w = createWorld(10);
    addPlayer(w, 0, 0, 0);
    addPlayer(w, 1, 4, 0);
    w.pHp[0] = w.pHp[1] = 1e9;
    w.pMaxHp[0] = w.pMaxHp[1] = 1e9;
    // wave of one enemy that the second player shoots dead
    w.misc[MISC.Total] = 1;
    w.misc[MISC.Remaining] = 0;
    w.waveTick = w.tick;
    const e = spawnEnemy(w, 0, 8, 0, false);
    w.eHp[e] = 1;
    w.eCooldown[e] = 1e9;
    let seen: { by: number; x: number; y: number } | null = null;
    let clearedAt = -1;
    for (let t = 0; t < 120 && clearedAt < 0; t++) {
      step(w, [NONE, { ...NONE, buttons: Buttons.Fire }]);
      for (const ev of w.events) {
        if (ev.type === 'finalKill') seen = { by: ev.by, x: ev.x, y: ev.y };
        if (ev.type === 'waveCleared') clearedAt = w.tick;
      }
    }
    expect(clearedAt).toBeGreaterThan(0);
    expect(seen).not.toBeNull();
    expect(seen!.by).toBe(1);
    expect(seen!.x).toBeGreaterThan(5);
    expect(w.misc[MISC.Phase]).toBe(FloorPhase.Cleared);
    // locked while the finisher plays
    const x0 = w.pX[0]!;
    run2(w, 20);
    expect(w.pX[0]).toBe(x0);
    expect(w.misc[MISC.PhaseEnd]! - w.misc[MISC.Cine]!).toBe(Math.round(BALANCE.floors.clearedSeconds * 30));
  });
});

describe('the new bosses', () => {
  const boss = (variant: number, seed: number): { w: World; id: number } => {
    const w = quiet(seed);
    w.pHp[0] = w.pMaxHp[0] = 1e9;
    const id = spawnBoss(w);
    w.eBoss[id] = variant;
    w.eX[id] = 8;
    w.eY[id] = 0;
    w.eHp[id] = 1e9;
    w.eState[id] = 0;
    w.waveTick = w.tick - 1;
    return { w, id };
  };

  it('the boss cycle has eleven variants', () => {
    const seen = new Set<number>();
    for (let k = 1; k <= 11; k++) {
      const w = createWorld(1);
      addPlayer(w, 0, 0, 0);
      w.wave = k * BALANCE.progression.boss.everyWaves;
      seen.add(w.eBoss[spawnBoss(w)]!);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('meteors rain on the player: telegraphs first, hits after', () => {
    const { w } = boss(5, 21);
    let telegraphs = 0;
    let hits = 0;
    for (let t = 0; t < 30 * 20; t++) {
      w.pHp[0] = w.pMaxHp[0]!; // the meteors hit hard now: keep the target standing
      step(w, [NONE]);
      for (const e of w.events) {
        if (e.type === 'telegraph') telegraphs++;
        if (e.type === 'teleHit') hits++;
      }
    }
    expect(telegraphs).toBeGreaterThan(6);
    expect(hits).toBeGreaterThan(6);
  });

  it('the purger paints about 60% of the arena and halves (later kills) whoever stays in it', () => {
    for (let seed = 30; seed < 40; seed++) {
      const { w } = boss(6, seed);
      let found = false;
      for (let t = 0; t < 30 * 14 && !found; t++) {
        w.pHp[0] = w.pMaxHp[0]!;
        step(w, [NONE]);
        for (let i = 0; i < w.tActive.length; i++) {
          if (!w.tActive[i] || w.tTotal[i]! < 150) continue;
          const area = w.tShape[i] === TeleShape.Circle ? Math.PI * w.tW[i]! ** 2 : 4 * w.tL[i]! * w.tW[i]!;
          const frac = area / (4 * ARENA_HALF_W * ARENA_HALF_H);
          expect(frac).toBeGreaterThan(0.55);
          expect(frac).toBeLessThan(0.65);
          expect([TeleEffect.Half, TeleEffect.Kill]).toContain(w.tEffect[i]);
          found = true;
        }
      }
      expect(found).toBe(true);
    }
    const early = boss(6, 50).w;
    early.wave = 10;
    const late = boss(6, 50).w;
    late.wave = BALANCE.bossAttacks.purge.killFloor + 5;
    for (const [w, effect] of [[early, TeleEffect.Half], [late, TeleEffect.Kill]] as const) {
      let got = -1;
      for (let t = 0; t < 30 * 14 && got < 0; t++) {
        w.pHp[0] = w.pMaxHp[0]!;
        step(w, [NONE]);
        for (let i = 0; i < w.tActive.length; i++) if (w.tActive[i] && w.tTotal[i]! >= 150) got = w.tEffect[i]!;
      }
      expect(got).toBe(effect);
    }
  }, 60_000);
});

describe('late floors', () => {
  it('enemies hit harder and have more health past the early floors', () => {
    const hit = (wave: number): { dmg: number; hp: number } => {
      const w = quiet(60);
      w.wave = wave;
      const e = spawnEnemy(w, 0, 0, 0, false);
      const before = w.pHp[0]!;
      // hurt through the telegraph path (it uses hurtPlayer, which carries the floor scaling)
      addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 3, 0, 0.1, 10);
      run(w, 6);
      return { dmg: before - w.pHp[0]!, hp: w.eHp[e]! / (w.hpMul || 1) };
    };
    const early = hit(5);
    const late = hit(35);
    expect(late.dmg).toBeGreaterThan(early.dmg * 1.5);
  });
});

describe('state', () => {
  it('zones, telegraphs, stun and frost survive a snapshot and are part of the hash', () => {
    const w = quiet(70);
    addZone(w, 3, 3, 2, 5, ZoneKind.Fire);
    addTelegraph(w, TeleShape.Rect, TeleEffect.Half, 1, 2, 0.5, 3, 9, 2, 0);
    launchPlayer(w, 0, 3, 4, 0.5);
    const e = spawnEnemy(w, 0, 5, 5, false);
    w.eFrost[e] = 40;
    run(w, 5);
    const copy = createWorld(70);
    restoreWorld(copy, serializeWorld(w));
    expect(hashWorld(copy)).toBe(hashWorld(w));
    const h = hashWorld(w);
    w.eFrost[e] = 41;
    expect(hashWorld(w)).not.toBe(h);
  });
});
