import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, ENEMY_TYPES, MAPS, TAN30, deckAt, heightAt, isLayered, nextLayer, rampAt, rampDir, rampGrade, rampT, type MapDef, type PlayerInput } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, hashWorld, predictPlayer, restoreWorld, serializeWorld, spawnEnemy, step, type World } from '../src';
import { cellIndex } from '../src/flowfield';
import { spawnPickup } from '../src/pickups';

const NONE: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
const mapIndex = (id: string): number => MAPS.findIndex((m) => m.id === id);
const LAYERED = MAPS.filter(isLayered);
const GRUNT = ENEMY_TYPES.indexOf('grunt');

function arena(id: string, seed = 1): { w: World; map: MapDef } {
  const w = createWorld(seed, mapIndex(id));
  w.waveTick = 1e9;
  w.countMul = 0;
  addPlayer(w, 0, 0, 0);
  w.pHp[0] = w.pMaxHp[0] = 1e9;
  return { w, map: MAPS[mapIndex(id)]! };
}

/** Walk the player straight along (dx, dy) for n ticks. */
function walk(w: World, dx: number, dy: number, n: number, extra = 0): void {
  for (let t = 0; t < n; t++) step(w, [{ ...NONE, moveX: Math.round(dx * 127), moveY: Math.round(dy * 127), buttons: extra }]);
}

describe('the vertical maps are well formed', () => {
  it('there are five of them, after the flat ones', () => {
    expect(LAYERED.map((m) => m.id)).toEqual(['overpass', 'depot', 'rampyard', 'tunnelhub', 'mezzanine']);
    expect(mapIndex('overpass')).toBeGreaterThanOrEqual(6);
  });

  it('every ramp is 30 or 45 degrees, ends exactly at a deck of its height, starts on free ground and lies inside the arena', () => {
    for (const m of LAYERED) {
      for (const r of m.ramps!) {
        const g = rampGrade(r);
        expect(Math.abs(g - TAN30) < 0.01 || Math.abs(g - 1) < 0.01, `${m.id}: grade ${g}`).toBe(true);
        const d = rampDir(r);
        const half = (r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2;
        // the top edge touches the deck it climbs to
        const topX = r.x + d[0] * (half + 0.3);
        const topY = r.y + d[1] * (half + 0.3);
        const di = deckAt(m, topX, topY);
        expect(di, `${m.id}: the ramp at ${r.x},${r.y} does not reach a deck`).toBeGreaterThanOrEqual(0);
        expect(m.decks![di]!.z, `${m.id}: height of the deck`).toBeCloseTo(r.z, 5);
        expect(Math.abs(r.x) + r.w / 2).toBeLessThan(ARENA_HALF_W);
        expect(Math.abs(r.y) + r.h / 2).toBeLessThan(ARENA_HALF_H);
        // the foot is open ground
        const fx = r.x - d[0] * (half + 0.8);
        const fy = r.y - d[1] * (half + 0.8);
        const w = createWorld(1, mapIndex(m.id));
        expect(w.field.blocked[cellIndex(fx, fy)], `${m.id}: the foot of the ramp at ${r.x},${r.y} is blocked`).toBe(0);
      }
    }
  });

  it('the spawn ring is free on the ground on every vertical map, and the ground is connected', () => {
    for (const m of LAYERED) {
      const w = createWorld(1, mapIndex(m.id));
      for (const [x, y] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) expect(w.field.blocked[cellIndex(x, y)], `${m.id} blocked at ${x},${y}`).toBe(0);
      w.field.compute([cellIndex(0, 0)], 1);
      let unreachable = 0;
      for (let x = -28; x <= 28; x += 4) for (const y of [-18, 18]) if (!w.field.blocked[cellIndex(x, y)] && w.field.cost[cellIndex(x, y)]! > 1e8) unreachable++;
      expect(unreachable, `${m.id}: ground cells that cannot be reached`).toBe(0);
      // the deck layer: the top of every ramp connects to the rest of its deck
      w.field1.compute(m.ramps!.map((r) => cellIndex(r.x + rampDir(r)[0] * ((r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2 - 0.45), r.y + rampDir(r)[1] * ((r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2 - 0.45))), m.ramps!.length);
      for (const d of m.decks!) expect(w.field1.cost[cellIndex(d.x, d.y)]!, `${m.id}: a deck that cannot be reached from its ramps`).toBeLessThan(1e8);
    }
  });
});

describe('height and layers', () => {
  it('the height follows a ramp linearly, the deck is flat and the ground is zero', () => {
    const m = MAPS[mapIndex('overpass')]!;
    const r = m.ramps![1]!; // east, climbing toward -x
    expect(rampT(r, r.x + r.w / 2, r.y)).toBeCloseTo(0, 5);
    expect(rampT(r, r.x - r.w / 2, r.y)).toBeCloseTo(1, 5);
    expect(heightAt(m, r.x, r.y, 0)).toBeCloseTo(2, 3); // half way up a 4 high ramp
    expect(heightAt(m, 0, 11, 1)).toBe(4);
    expect(heightAt(m, 0, 11, 0)).toBe(0); // underneath it is the ground
    expect(heightAt(m, 0, -10, 0)).toBe(0);
    expect(nextLayer(m, r.x - r.w / 2 + 0.1, r.y, 0)).toBe(1);
    expect(nextLayer(m, r.x + r.w / 2 - 0.1, r.y, 1)).toBe(0);
    expect(rampAt(m, 0, 0)).toBe(-1);
  });
});

describe('moving between the levels', () => {
  it('walking up a ramp ends on the deck at its height; walking back down ends on the ground', () => {
    for (const m of LAYERED) {
      const { w } = arena(m.id);
      const r = m.ramps![0]!;
      const d = rampDir(r);
      const half = (r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2;
      w.pX[0] = r.x - d[0] * (half - 0.2);
      w.pY[0] = r.y - d[1] * (half - 0.2);
      expect(w.pLayer[0]).toBe(0);
      let sawRamp = false;
      for (let t = 0; t < 150 && w.pLayer[0] === 0; t++) {
        step(w, [{ ...NONE, moveX: Math.round(d[0] * 127), moveY: Math.round(d[1] * 127) }]);
        if (rampAt(m, w.pX[0]!, w.pY[0]!) >= 0) sawRamp = true;
      }
      expect(sawRamp, m.id).toBe(true);
      expect(w.pLayer[0], `${m.id}: still on the ground after the climb`).toBe(1);
      expect(heightAt(m, w.pX[0]!, w.pY[0]!, w.pLayer[0]!), m.id).toBeGreaterThan(r.z * 0.85);
      // and back down
      for (let t = 0; t < 150 && w.pLayer[0] === 1; t++) step(w, [{ ...NONE, moveX: Math.round(-d[0] * 127), moveY: Math.round(-d[1] * 127) }]);
      expect(w.pLayer[0], `${m.id}: did not come back down`).toBe(0);
    }
  });

  it('the steeper the ramp the slower the climb, and going down is faster than going up', () => {
    const m = MAPS[mapIndex('depot')]!;
    const time = (rampIx: number, up: boolean): number => {
      const { w } = arena('depot');
      const r = m.ramps![rampIx]!;
      const d = rampDir(r);
      const half = (r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2;
      const sgn = up ? 1 : -1;
      w.pX[0] = r.x - sgn * d[0] * (half - 0.5);
      w.pY[0] = r.y - sgn * d[1] * (half - 0.5);
      w.pLayer[0] = up ? 0 : 1;
      let t = 0;
      const startX = w.pX[0]!;
      const startY = w.pY[0]!;
      for (; t < 300; t++) {
        step(w, [{ ...NONE, moveX: Math.round(sgn * d[0] * 127), moveY: Math.round(sgn * d[1] * 127) }]);
        if (Math.hypot(w.pX[0]! - startX, w.pY[0]! - startY) >= (half - 0.6) * 2) break;
      }
      return t / ((half - 0.6) * 2); // ticks per unit of ground covered
    };
    const flat = (): number => {
      const { w } = arena('depot');
      w.pX[0] = -6;
      w.pY[0] = 6;
      const x0 = w.pX[0]!;
      walk(w, 1, 0, 30);
      return 30 / (w.pX[0]! - x0);
    };
    const f = flat();
    const up30 = time(0, true);
    const up45 = time(1, true);
    const down30 = time(0, false);
    expect(up30).toBeGreaterThan(f * 1.05);
    expect(up45).toBeGreaterThan(up30 * 1.05);
    expect(down30).toBeLessThan(f * 0.99);
  });

  it('a character on a deck cannot step off its edge, and the rails do not let it through', () => {
    for (const m of LAYERED) {
      const { w } = arena(m.id);
      const d = m.decks![0]!;
      w.pX[0] = d.x;
      w.pY[0] = d.y;
      w.pLayer[0] = 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        w.pX[0] = d.x;
        w.pY[0] = d.y;
        w.pLayer[0] = 1;
        for (let t = 0; t < 120; t++) {
          walk(w, dx, dy, 1);
          // a deck character is always on a deck or a ramp (the open ends of the ramps are the ways down: there it becomes a ground character)
          if (w.pLayer[0] === 1) expect(deckAt(m, w.pX[0]!, w.pY[0]!) >= 0 || rampAt(m, w.pX[0]!, w.pY[0]!) >= 0, `${m.id}: off the deck going ${dx},${dy} at ${w.pX[0]!.toFixed(1)},${w.pY[0]!.toFixed(1)}`).toBe(true);
        }
      }
    }
  });

  it('the ground under a deck is walkable (the overpass), pillars and tunnel walls are not', () => {
    const { w } = arena('overpass');
    w.pX[0] = 0;
    w.pY[0] = 6;
    walk(w, 0, 1, 40); // north, under the bridge
    expect(w.pLayer[0]).toBe(0);
    expect(w.pY[0]!).toBeGreaterThan(10);
    expect(heightAt(MAPS[mapIndex('overpass')]!, w.pX[0]!, w.pY[0]!, 0)).toBe(0);
    const p = arena('overpass').w;
    p.pX[0] = 6;
    p.pY[0] = 8.4;
    walk(p, 1, 0, 40); // into the pillar at (9, 8.4)
    expect(p.pX[0]!).toBeLessThan(9);
  });
});

describe('fighting across the levels', () => {
  const still = (w: World, x: number, y: number, layer: number): number => {
    const e = spawnEnemy(w, GRUNT, x, y, false);
    w.eCooldown[e] = 1e9;
    w.eFrost[e] = 1e6;
    w.eLayer[e] = layer;
    w.eHp[e] = 1e6;
    return e;
  };

  it('a shot from a deck hits the ground below; a shot from the ground does not reach the deck', () => {
    const m = MAPS[mapIndex('overpass')]!;
    const hit = (shooterLayer: number, targetLayer: number): boolean => {
      const { w } = arena('overpass');
      w.pX[0] = -5;
      w.pY[0] = 11;
      w.pLayer[0] = shooterLayer;
      const e = still(w, 5, 11, targetLayer);
      const hp = w.eHp[e]!;
      for (let t = 0; t < 40; t++) step(w, [{ ...NONE, buttons: Buttons.Fire, aim: 0 }]);
      void m;
      return w.eHp[e]! < hp;
    };
    expect(hit(1, 0)).toBe(true); // from the deck down
    expect(hit(1, 1)).toBe(true);
    expect(hit(0, 0)).toBe(true);
    expect(hit(0, 1)).toBe(false); // the deck is above it
  });

  it('a pillar stops ground shots, rails do not stop shots from the deck', () => {
    const shotsReach = (layer: number, y: number, x0: number, x1: number): boolean => {
      const { w } = arena('overpass');
      w.pX[0] = x0;
      w.pY[0] = y;
      w.pLayer[0] = layer;
      const e = still(w, x1, y, layer);
      const hp = w.eHp[e]!;
      for (let t = 0; t < 40; t++) step(w, [{ ...NONE, buttons: Buttons.Fire, aim: 0 }]);
      return w.eHp[e]! < hp;
    };
    expect(shotsReach(0, 8.4, 5, 14)).toBe(false); // the pillar at (9, 8.4) is in the way
    expect(shotsReach(0, 11, 5, 12)).toBe(true); // along the middle of the bridge underside: nothing there
    expect(shotsReach(1, 11, -10, 10)).toBe(true);
  });

  it('enemies cannot hurt a player on the other level, but do walk the ramps to reach one', () => {
    const { w } = arena('overpass', 3);
    w.pX[0] = 0;
    w.pY[0] = 11; // on the bridge
    w.pLayer[0] = 1;
    w.pHp[0] = w.pMaxHp[0] = 1000;
    const e = spawnEnemy(w, GRUNT, 0, 5, false); // right under it, on the ground
    w.eCooldown[e] = 0;
    for (let t = 0; t < 120; t++) step(w, [NONE]);
    expect(w.pHp[0]).toBe(1000); // it stood below and could not reach
    // given time it takes the ramp
    let climbed = false;
    for (let t = 0; t < 30 * 40 && !climbed; t++) {
      step(w, [NONE]);
      if (w.eLayer[e] === 1) climbed = true;
    }
    expect(climbed).toBe(true);
    for (let t = 0; t < 30 * 10; t++) step(w, [NONE]);
    expect(w.pHp[0]).toBeLessThan(1000); // now it is up there and fights
  });

  it('enemies on a deck come down for a player on the ground', () => {
    const { w } = arena('overpass', 4);
    w.pX[0] = 0;
    w.pY[0] = -2;
    const e = spawnEnemy(w, GRUNT, 0, 11, false);
    w.eLayer[e] = 1;
    w.eCooldown[e] = 0;
    let down = false;
    for (let t = 0; t < 30 * 40 && !down; t++) {
      step(w, [NONE]);
      if (w.eLayer[e] === 0) down = true;
    }
    expect(down).toBe(true);
  });

  it('a melee swing only hits the level it was made on', () => {
    const { w } = arena('overpass');
    // a swordsman needs the class: swap the loadout through addPlayer
    const v = createWorld(1, mapIndex('overpass'));
    v.waveTick = 1e9;
    v.countMul = 0;
    addPlayer(v, 0, 0, 5, 'pistol', 7);
    v.pHp[0] = v.pMaxHp[0] = 1e9;
    const ground = still(v, 2, 5, 0);
    const deck = still(v, 2, 5.5, 1);
    const hp = [v.eHp[ground]!, v.eHp[deck]!];
    for (let t = 0; t < 20; t++) step(v, [{ ...NONE, buttons: Buttons.Fire }]);
    expect(v.eHp[ground]!).toBeLessThan(hp[0]!);
    expect(v.eHp[deck]).toBe(hp[1]);
    void w;
  });
});

describe('loot on the levels', () => {
  it('a pickup on a deck can only be taken from the deck, one on the ground only from the ground', () => {
    const grab = (pickupLayer: number, playerLayer: number): boolean => {
      const { w } = arena('overpass');
      w.pX[0] = 4;
      w.pY[0] = 11;
      w.pLayer[0] = playerLayer;
      w.pHp[0] = 10;
      w.pMaxHp[0] = 1e9;
      spawnPickup(w, 1, 4, 11, 0, pickupLayer); // health
      for (let t = 0; t < 10; t++) step(w, [NONE]);
      return w.pHp[0]! > 12;
    };
    expect(grab(1, 1)).toBe(true);
    expect(grab(1, 0)).toBe(false);
    expect(grab(0, 0)).toBe(true);
    expect(grab(0, 1)).toBe(false);
  });

  it('loot thrown off the edge of a deck lands on the ground', () => {
    const { w } = arena('overpass');
    spawnPickup(w, 1, 0, 3, 0, 1); // (0, 3) is nowhere near the bridge
    expect(w.kLayer[0]).toBe(0);
    spawnPickup(w, 1, 0, 11, 0, 1);
    expect(w.kLayer[1]).toBe(1);
  });
});

describe('prediction and state on the vertical maps', () => {
  it('the client prediction follows climbs, rails and slopes exactly', () => {
    for (const id of ['overpass', 'depot', 'rampyard']) {
      const real = arena(id, 5).w;
      const ghost = arena(id, 5).w;
      const m = MAPS[mapIndex(id)]!;
      const r = m.ramps![0]!;
      const d = rampDir(r);
      const half = (r.dir === 0 || r.dir === 2 ? r.w : r.h) / 2;
      for (const w of [real, ghost]) {
        w.pX[0] = r.x - d[0] * (half + 1.5);
        w.pY[0] = r.y - d[1] * (half + 1.5);
      }
      const list: PlayerInput[] = [];
      for (let t = 0; t < 160; t++) list.push({ ...NONE, moveX: Math.round(d[0] * 127), moveY: Math.round(d[1] * 127), aim: t * 300, buttons: t === 40 ? Buttons.Dash : 0 });
      let reachedDeck = false;
      for (let t = 0; t < list.length; t++) {
        step(real, [list[t]!]);
        if (real.pLayer[0] === 1) reachedDeck = true;
        if (t < 6) continue;
        step(ghost, [list[t - 6]!]);
        const p = predictPlayer(ghost, 0, list.slice(t - 5, t + 1));
        expect(p.x, `${id} tick ${t}`).toBe(real.pX[0]);
        expect(p.y, `${id} tick ${t}`).toBe(real.pY[0]);
      }
      expect(reachedDeck, id).toBe(true);
    }
  });

  it('layers survive a snapshot and are part of the hash', () => {
    const { w } = arena('depot', 6);
    w.pLayer[0] = 1;
    w.pX[0] = 15;
    w.pY[0] = -10;
    const e = spawnEnemy(w, GRUNT, 3, 3, false);
    w.eLayer[e] = 1;
    for (let t = 0; t < 30; t++) step(w, [NONE]);
    const copy = createWorld(6, mapIndex('depot'));
    restoreWorld(copy, serializeWorld(w));
    expect(hashWorld(copy)).toBe(hashWorld(w));
    expect(copy.pLayer[0]).toBe(1);
    const h = hashWorld(w);
    w.pLayer[0] = 0;
    expect(hashWorld(w)).not.toBe(h);
  });

  it('a squad of bots plays a long game on the vertical maps deterministically', () => {
    const play = (): string => {
      const w = createWorld(9, mapIndex('rampyard'));
      addPlayer(w, 0, 0, 0);
      addPlayer(w, 1, 2, 0);
      for (let s = 0; s < 2; s++) w.pHp[s] = w.pMaxHp[s] = 1e9;
      w.pLayer[1] = 0;
      for (let t = 0; t < 900; t++) {
        const walkIn = (s: number): PlayerInput => ({ moveX: Math.round(Math.sin(t * 0.04 + s) * 127), moveY: Math.round(Math.cos(t * 0.03 + s * 2) * 127), aim: t * 411, buttons: Buttons.Fire });
        step(w, [walkIn(0), walkIn(1)]);
      }
      return `${hashWorld(w)}/${w.pLayer[0]}${w.pLayer[1]}`;
    };
    expect(play()).toBe(play());
    void BALANCE;
  }, 120000);
});
