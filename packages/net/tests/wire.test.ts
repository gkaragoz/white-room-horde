import { Buttons, CLASS_IDS, INPUT_BYTES, WEAPON_IDS, clampInput, decodeTick, encodeTick, type PlayerInput } from '@wrh/shared';
import { decodeBundle, encodeBundle } from '../src/protocol';
import { describe, expect, it } from 'vitest';

describe('wire format', () => {
  it('an input is 11 bytes and keeps all nine button bits, the weapon choice (up to the last weapon), the drone choice and the grenade angle', () => {
    expect(INPUT_BYTES).toBe(11);
    const i: PlayerInput = { moveX: -100, moveY: 77, aim: 54321, buttons: Buttons.Fire | Buttons.Special | Buttons.Card3 | Buttons.Dash, aimDist: 33, wsel: WEAPON_IDS.length, dsel: 7, gAim: 1234 };
    const back = decodeTick(encodeTick([undefined, i]), 2).inputs[1]!;
    expect(back).toEqual(clampInput(i));
    expect(back.buttons & Buttons.Special).toBe(Buttons.Special);
    expect(back.buttons).toBe(i.buttons);
  });

  it('a late join carries the last weapon and the last class', () => {
    const joins = [{ slot: 3, weaponIndex: WEAPON_IDS.length - 1, cls: CLASS_IDS.length - 1 }, { slot: 1, weaponIndex: 0, cls: 0 }];
    const b = decodeBundle(encodeBundle({ tick: 77, joins, inputs: [] }), 4);
    expect(b.joins).toEqual(joins);
    expect(b.tick).toBe(77);
  });
});
