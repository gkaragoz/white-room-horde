import { describe, expect, it } from 'vitest';
import {
  createGame,
  createWorld,
  hashWorld,
  restoreWorld,
  scriptedInput,
  serializeWorld,
  step,
} from '../src';
import {
  ARRAYS,
  ARRAY_NAMES,
  NESTED_ARRAYS,
  SCALARS,
  SCALAR_NAMES,
  createFields,
  nestedArray,
  type TypedArray,
} from '../src/schema';

/** Members of a World that are not simulated numbers: the rng object, the event queue, the spatial hash and the flow fields (whose arrays are in NESTED_ARRAYS). */
const OUTSIDE_SCHEMA = new Set(['rng', 'events', 'field', 'field1', 'grid']);

function steppedWorld(ticks = 120) {
  const w = createGame({
    seed: 5,
    players: [
      { slot: 0, weapon: 'smg' },
      { slot: 1, weapon: 'ar' },
    ],
    map: 1,
    mods: 0b101,
  });
  for (let t = 0; t < ticks; t++) step(w, [scriptedInput(t, 0), scriptedInput(t, 1)]);
  return w;
}

describe('WorldSchema', () => {
  it('declares every number and typed array a World has, and nothing else', () => {
    const w = createWorld(1) as unknown as Record<string, unknown>;
    const undeclared: string[] = [];
    for (const [name, v] of Object.entries(w)) {
      if (OUTSIDE_SCHEMA.has(name)) continue;
      if (ArrayBuffer.isView(v) ? !(name in ARRAYS) : typeof v === 'number' ? !(name in SCALARS) : true)
        undeclared.push(name);
    }
    expect(undeclared).toEqual([]);
    for (const name of [...ARRAY_NAMES, ...SCALAR_NAMES]) expect(name in w, name).toBe(true);
  });

  it('allocates what createWorld allocates (kind, length, initial values)', () => {
    const w = createWorld(1, 2, 0b11) as unknown as Record<string, TypedArray | number>;
    const f = createFields({ map: 2, mods: 0b11 }) as unknown as Record<string, TypedArray | number>;
    for (const name of SCALAR_NAMES) expect(f[name], name).toBe(w[name]);
    for (const name of ARRAY_NAMES) {
      const a = f[name] as TypedArray;
      const b = w[name] as TypedArray;
      expect(a.constructor, name).toBe(b.constructor);
      expect(Array.from(a), name).toEqual(Array.from(b));
    }
  });

  it('puts every field in the world hash unless it declares why not', () => {
    const w = steppedWorld() as unknown as Record<string, TypedArray | number>;
    const hashed: string[] = [];
    const unhashed: string[] = [];
    const probe = (name: string, bump: () => void, undo: () => void, reason: string | undefined): void => {
      const before = hashWorld(w as never);
      bump();
      const changed = hashWorld(w as never) !== before;
      undo();
      (changed ? hashed : unhashed).push(name);
      if (reason)
        expect(changed, `${name} is declared unhashed (${reason}) but the hash reads it`).toBe(false);
      else expect(changed, `${name} is not in the world hash`).toBe(true);
    };
    for (const name of SCALAR_NAMES) {
      const old = w[name] as number;
      probe(
        name,
        () => (w[name] = old + 1),
        () => (w[name] = old),
        SCALARS[name].unhashed,
      );
    }
    for (const name of ARRAY_NAMES) {
      const a = w[name] as TypedArray;
      const old = a[0]!;
      probe(
        name,
        () => (a[0] = old + 1),
        () => (a[0] = old),
        ARRAYS[name].unhashed,
      );
    }
    for (const n of NESTED_ARRAYS) {
      const a = nestedArray(w, n.path);
      const old = a[0]!;
      probe(
        n.path,
        () => (a[0] = old + 1),
        () => (a[0] = old),
        n.unhashed,
      );
    }
    expect(unhashed.sort()).toEqual([
      'countMul',
      'field.cost',
      'field.dirX',
      'field.dirY',
      'field1.cost',
      'field1.dirX',
      'field1.dirY',
      'hpMul',
      'pMoving',
    ]);
    expect(hashed.length).toBeGreaterThan(150);
  });

  it('round-trips every field through a snapshot', () => {
    const a = steppedWorld() as unknown as Record<string, TypedArray | number>;
    for (const name of SCALAR_NAMES) if (name !== 'map') a[name] = (a[name] as number) + 1;
    for (const name of ARRAY_NAMES) (a[name] as TypedArray)[0] = (a[name] as TypedArray)[0]! + 1;
    for (const n of NESTED_ARRAYS) {
      const arr = nestedArray(a, n.path);
      arr[0] = arr[0]! + 1;
    }
    const b = createWorld(1) as unknown as Record<string, TypedArray | number>;
    restoreWorld(b as never, serializeWorld(a as never));
    for (const name of SCALAR_NAMES) expect(b[name], name).toBe(a[name]);
    for (const name of ARRAY_NAMES)
      expect(Array.from(b[name] as TypedArray), name).toEqual(Array.from(a[name] as TypedArray));
    for (const n of NESTED_ARRAYS)
      expect(Array.from(nestedArray(b, n.path)), n.path).toEqual(Array.from(nestedArray(a, n.path)));
  });
});
