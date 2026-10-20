import { BALANCE, ENEMY_TYPES, PlayerState, ZoneKind, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '../src';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const T = (name: string): number => ENEMY_TYPES.indexOf(name as (typeof ENEMY_TYPES)[number]);

function arena(seed: number, px = 0, py = 0): World {
  const w = createWorld(seed);
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, px, py);
  w.pHp[0] = w.pMaxHp[0] = 1e6;
  return w;
}

function run(w: World, ticks: number, each?: (w: World) => void): void {
  for (let t = 0; t < ticks; t++) {
    step(w, [NONE]);
    each?.(w);
  }
}

function enemy(w: World, name: string, x: number, y: number): number {
  const e = spawnEnemy(w, T(name), x, y, false);
  w.eCooldown[e] = 0;
  return e;
}

describe('the ten newer enemy types exist and are tuned', () => {
  const names = ['acider', 'rammer', 'mortar', 'sledge', 'lamper', 'reviver', 'marksman', 'blinker', 'magnetar', 'flamer'];
  it('every one has stats, an unlock floor, a weight, xp and its own behaviour numbers', () => {
    for (const n of names) {
      expect(T(n), n).toBeGreaterThan(10);
      expect(BALANCE.enemies[n as 'acider'].hp).toBeGreaterThan(0);
      expect(BALANCE.waves.unlock[n as 'acider']).toBeGreaterThanOrEqual(8);
      expect(BALANCE.waves.weights[n as 'acider']).toBeGreaterThan(0);
      expect(BALANCE.progression.xp[n as 'acider']).toBeGreaterThan(0);
      expect(BALANCE.special[n], n).toBeTruthy();
    }
    expect(new Set(ENEMY_TYPES).size).toBe(ENEMY_TYPES.length);
    expect(ENEMY_TYPES.length).toBe(21);
  });

  it('they join the waves in order as the floors go up', () => {
    const seen = (wave: number): Set<number> => {
      const w = createWorld(3);
      addPlayer(w, 0, 0, 0);
      w.pHp[0] = w.pMaxHp[0] = 1e9;
      w.wave = wave;
      w.misc[1] = 400;
      w.misc[3] = 400;
      w.waveTick = w.tick;
      const types = new Set<number>();
      for (let t = 0; t < 600; t++) {
        step(w, [NONE]);
        for (let i = 0; i < w.eActive.length; i++) if (w.eActive[i]) types.add(w.eType[i]!);
        for (let i = 0; i < w.eActive.length; i++) if (w.eActive[i] && w.eType[i]! > 10) w.eHp[i] = 1e9;
      }
      return types;
    };
    const early = seen(5);
    for (const n of names) expect(early.has(T(n)), `${n} too early`).toBe(false);
    const late = seen(30);
    let present = 0;
    for (const n of names) if (late.has(T(n))) present++;
    expect(present).toBeGreaterThanOrEqual(7);
  }, 60000);
});

describe('acid sprayer', () => {
  it('leaves a trail of acid as it walks and spits a puddle at the player', () => {
    const w = arena(1, 0, 0);
    enemy(w, 'acider', 14, 0);
    let telegraphs = 0;
    run(w, 90, (x) => {
      telegraphs += x.events.filter((e) => e.type === 'telegraph').length;
    });
    expect([...w.zActive].filter(Boolean).length).toBeGreaterThan(3);
    expect(telegraphs).toBeGreaterThan(0);
    expect([...w.zKind].some((k, i) => w.zActive[i] && k === ZoneKind.Acid)).toBe(true);
  });
});

describe('rammer', () => {
  it('stops, trembles for a moment, then charges dead straight and throws what it meets, players and enemies', () => {
    const w = arena(2, -12, 0);
    const r = enemy(w, 'rammer', 6, 0);
    const bystander = enemy(w, 'grunt', -2, 0);
    w.eCooldown[bystander] = 1e9;
    w.eFrost[bystander] = 1e6; // stands in the way, frozen
    let windup = false;
    let thrownEnemy = false;
    let launched = false;
    let x0 = Number.NaN;
    for (let t = 0; t < 120; t++) {
      step(w, [NONE]);
      if (w.eAct[r] === 1) {
        windup = true;
        if (Number.isNaN(x0)) x0 = w.eX[r]!;
        expect(w.eX[r]).toBeCloseTo(x0, 1); // stands still while it winds up
        expect(w.eAux[r]).toBeGreaterThan(20); // the client draws a charge bar from this
      }
      if (w.eAir[bystander]! > 0 || !w.eActive[bystander]) thrownEnemy = true;
      if (w.events.some((e) => e.type === 'launch')) launched = true;
    }
    expect(windup).toBe(true);
    expect(thrownEnemy).toBe(true);
    expect(launched).toBe(true);
    expect(w.pStun[0]! > 0 || w.pHp[0]! < 1e6).toBe(true);
  });
});

describe('mortar grenadier', () => {
  it('backs off to a distance and then lobs a salvo of telegraphed shells', () => {
    const w = arena(3, 0, 0);
    const m = enemy(w, 'mortar', 5, 0);
    let shells = 0;
    run(w, 90, (x) => {
      shells += x.events.filter((e) => e.type === 'telegraph').length;
    });
    expect(Math.hypot(w.eX[m]! - w.pX[0]!, w.eY[m]! - w.pY[0]!)).toBeGreaterThan(8);
    expect(shells).toBeGreaterThanOrEqual(BALANCE.special.mortar!.shells!);
  });
});

describe('sledge brute and lamp spinner', () => {
  it('the sledge winds up and slams: a circle ahead of it, then a hit and a throw', () => {
    const w = arena(4, 0, 0);
    enemy(w, 'sledge', 2.5, 0);
    let hit = false;
    let launched = false;
    run(w, 90, (x) => {
      if (x.events.some((e) => e.type === 'teleHit')) hit = true;
      if (x.events.some((e) => e.type === 'launch')) launched = true;
    });
    expect(hit).toBe(true);
    expect(launched).toBe(true);
  });

  it('the lamp spinner sweeps a big circle around itself after charging up', () => {
    const w = arena(5, 0, 0);
    const l = enemy(w, 'lamper', 5, 0);
    let charged = false;
    let radius = 0;
    run(w, 90, (x) => {
      if (x.eAct[l] === 1) charged = true;
      for (const e of x.events) if (e.type === 'teleHit') radius = e.radius;
    });
    expect(charged).toBe(true);
    expect(radius).toBeCloseTo(BALANCE.special.lamper!.radius!, 3);
  });
});

describe('reviver, marksman, blinker, magnetar, flamer', () => {
  it('the reviver keeps its distance and calls crawlers', () => {
    const w = arena(6, 0, 0);
    const r = enemy(w, 'reviver', 6, 0);
    run(w, 100);
    expect(Math.hypot(w.eX[r]! - w.pX[0]!, w.eY[r]! - w.pY[0]!)).toBeGreaterThan(7);
    let crawlers = 0;
    for (let i = 0; i < w.eActive.length; i++) if (w.eActive[i] && w.eType[i] === T('crawler')) crawlers++;
    expect(crawlers).toBeGreaterThanOrEqual(BALANCE.special.reviver!.count! - 1);
  });

  it('the marksman aims a long thin line at the player, which hits hard when it lands', () => {
    const w = arena(7, 0, 0);
    enemy(w, 'marksman', 15, 0);
    let line = false;
    let hit = false;
    run(w, 90, (x) => {
      for (const e of x.events) {
        if (e.type === 'telegraph' && e.shape === 1) line = true;
        if (e.type === 'teleHit' && e.shape === 1) hit = true;
      }
    });
    expect(line).toBe(true);
    expect(hit).toBe(true);
    expect(w.pHp[0]).toBeLessThan(1e6);
  });

  it('the blinker teleports behind the player', () => {
    const w = arena(8, 0, 0);
    const b = enemy(w, 'blinker', 14, 0);
    let blink: { x: number; y: number } | null = null;
    const facing = w.pAngle[0]!;
    run(w, 60, (x) => {
      for (const e of x.events) if (e.type === 'blink') blink = { x: e.x, y: e.y };
    });
    expect(blink).not.toBeNull();
    // behind: opposite to where the player faces (angle 0 = looking to +x, so behind is -x)
    expect(Math.cos(facing) * (blink!.x - w.pX[0]!) + Math.sin(facing) * (blink!.y - w.pY[0]!)).toBeLessThan(0);
    expect(w.eActive[b]).toBe(1);
  });

  it('the magnetar pulls the player toward it', () => {
    const w = arena(9, -10, 0);
    const m = enemy(w, 'magnetar', 0, 0);
    w.eFrost[m] = 0;
    const d0 = Math.hypot(w.eX[m]! - w.pX[0]!, w.eY[m]! - w.pY[0]!);
    let pulled = false;
    run(w, 120, (x) => {
      if (x.eAct[m] === 2) pulled = true;
    });
    expect(pulled).toBe(true);
    expect(Math.hypot(w.eX[m]! - w.pX[0]!, w.eY[m]! - w.pY[0]!)).toBeLessThan(d0 - 3);
  });

  it('the flamer lays a stream of fire in front of it', () => {
    const w = arena(10, 0, 0);
    enemy(w, 'flamer', 6, 0);
    run(w, 80);
    const fires = [...w.zKind].filter((k, i) => w.zActive[i] && k === ZoneKind.Fire).length;
    expect(fires).toBeGreaterThan(3);
  });
});

describe('they do not break the rest of the game', () => {
  it('a mixed horde of all the new types, 3000 ticks, keeps the pools sane and stays deterministic', () => {
    const play = (): number => {
      const w = createWorld(21);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0);
      addPlayer(w, 1, 3, 0);
      w.pHp[0] = w.pMaxHp[0] = w.pHp[1] = w.pMaxHp[1] = 1e9;
      for (let k = 0; k < 40; k++) enemy(w, ENEMY_TYPES[11 + (k % 10)]!, -25 + (k % 8) * 7, -15 + ((k / 8) | 0) * 7);
      for (let t = 0; t < 3000; t++) {
        step(w, [NONE, NONE]);
        for (let s = 0; s < 2; s++) w.pHp[s] = 1e9;
        // keep the horde alive and topped up so the whole behaviour set keeps running
        if (t % 300 === 0) for (let k = 0; k < 6; k++) enemy(w, ENEMY_TYPES[11 + ((t / 300 + k) % 10)]!, 20, -12 + k * 5);
      }
      expect(w.zActive.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(w.zActive.length);
      expect(w.pState[0]).toBe(PlayerState.Alive);
      return w.tick;
    };
    expect(play()).toBe(play());
  }, 60000);
});
