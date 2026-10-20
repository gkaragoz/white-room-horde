import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, Buttons, CLASS_IDS, MAPS, MAX_ENEMIES, MAX_PLAYERS, MAX_TELE, MAX_ZONES, WEAPON_IDS, deckWalkable, heightAt, type PlayerInput, type WeaponId } from '@wrh/shared';
import { describe, expect, it } from 'vitest';
import { createGame, createWorld, hashWorld, restoreWorld, serializeWorld, setWave, step, type World } from '../src';
import { Rng } from '../src/rng';

function check(w: World, label: string): string | null {
  const fin = (name: string, v: number): string | null => (Number.isFinite(v) ? null : `${label}: ${name} is ${v}`);
  const map = MAPS[w.map]!;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    const e = fin('pX', w.pX[s]!) ?? fin('pY', w.pY[s]!) ?? fin('pHp', w.pHp[s]!) ?? fin('pKnockX', w.pKnockX[s]!) ?? fin('pCharge', w.pCharge[s]!) ?? fin('pSpecCd', w.pSpecCd[s]!);
    if (e) return e;
    if (Math.abs(w.pX[s]!) > ARENA_HALF_W + 0.01 || Math.abs(w.pY[s]!) > ARENA_HALF_H + 0.01) return `${label}: player ${s} left the arena`;
    if (w.pHp[s]! > w.pMaxHp[s]! + 1e-9 || w.pHp[s]! < 0) return `${label}: player ${s} hp ${w.pHp[s]} (max ${w.pMaxHp[s]})`;
    if (w.pLayer[s]! > 1) return `${label}: player ${s} on layer ${w.pLayer[s]}`;
    if (w.pLayer[s] === 1 && !deckWalkable(map, w.pX[s]!, w.pY[s]!)) return `${label}: player ${s} on a deck layer in the air at ${w.pX[s]!.toFixed(1)},${w.pY[s]!.toFixed(1)}`;
    if (!Number.isFinite(heightAt(map, w.pX[s]!, w.pY[s]!, w.pLayer[s]!))) return `${label}: no height for player ${s}`;
    if (w.pSpecCd[s]! < 0 || w.pSpecT[s]! < 0 || w.pStun[s]! < 0 || w.pCharge[s]! < 0) return `${label}: negative timer on player ${s}`;
    if (w.pAmmo[s]! < -1 || w.pGren[s]! < 0) return `${label}: ammo ${w.pAmmo[s]} grenades ${w.pGren[s]}`;
  }
  let live = 0;
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eActive[i]) continue;
    live++;
    const e = fin('eX', w.eX[i]!) ?? fin('eY', w.eY[i]!) ?? fin('eHp', w.eHp[i]!) ?? fin('eVX', w.eVX[i]!);
    if (e) return e;
    if (Math.abs(w.eX[i]!) > ARENA_HALF_W + 0.01 || Math.abs(w.eY[i]!) > ARENA_HALF_H + 0.01) return `${label}: enemy ${i} left the arena`;
    if (w.eHp[i]! <= 0) return `${label}: living enemy ${i} with hp ${w.eHp[i]}`;
    if (w.eAct[i]! > 3 || w.eActT[i]! < 0 || w.eAir[i]! < 0 || w.eFrost[i]! < 0) return `${label}: enemy ${i} state out of range`;
    if (w.eLayer[i]! > 1) return `${label}: enemy ${i} on layer ${w.eLayer[i]}`;
    if (w.eLayer[i] === 1 && !deckWalkable(map, w.eX[i]!, w.eY[i]!)) return `${label}: enemy ${i} on a deck layer in the air at ${w.eX[i]!.toFixed(1)},${w.eY[i]!.toFixed(1)}`;
  }
  if (live !== w.enemyCount) return `${label}: enemyCount ${w.enemyCount} but ${live} alive`;
  let z = 0;
  for (let i = 0; i < MAX_ZONES; i++) if (w.zActive[i]) z++;
  let t = 0;
  for (let i = 0; i < MAX_TELE; i++) {
    if (!w.tActive[i]) continue;
    t++;
    if (w.tLeft[i]! <= 0 || w.tLeft[i]! > w.tTotal[i]!) return `${label}: telegraph ${i} with ${w.tLeft[i]} of ${w.tTotal[i]} ticks left`;
  }
  if (z > MAX_ZONES || t > MAX_TELE) return `${label}: pools overflow`;
  return null;
}

function randomInputs(rng: Rng, n: number): PlayerInput[] {
  return Array.from({ length: n }, () => ({
    moveX: rng.int(255) - 127,
    moveY: rng.int(255) - 127,
    aim: rng.int(65536),
    aimDist: rng.int(255),
    gAim: rng.int(65536),
    wsel: rng.int(6) === 0 ? rng.int(10) : rng.int(40) === 0 ? 14 : 0,
    buttons:
      (rng.int(4) ? Buttons.Fire : 0) |
      (rng.int(12) === 0 ? Buttons.Grenade : 0) |
      (rng.int(3) === 0 ? Buttons.Revive : 0) |
      (rng.int(6) === 0 ? Buttons.Dash : 0) |
      (rng.int(5) === 0 ? Buttons.Special : 0) |
      (rng.int(8) === 0 ? Buttons.Reload : 0) |
      (rng.int(25) === 0 ? Buttons.Card1 << rng.int(3) : 0),
  }));
}

describe('fuzz: every map, class and enemy together', () => {
  it('random squads on every arena at high floors stay finite, inside the arena, on valid levels and within the pools', () => {
    for (let m = 0; m < MAPS.length; m++) {
      const rng = new Rng(m * 104729 + 17);
      const n = 2 + (m % 3);
      const w = createGame({
        seed: 100 + m,
        map: m,
        players: Array.from({ length: n }, (_, s) => ({ slot: s, weapon: WEAPON_IDS[rng.int(WEAPON_IDS.length)] as WeaponId, cls: (m + s * 3) % CLASS_IDS.length })),
      });
      setWave(w, 12 + (m % 4) * 6); // the new enemy types and bosses are out from here on
      for (let s = 0; s < n; s++) {
        w.pMaxHp[s] = w.pHp[s] = 400;
      }
      let held = randomInputs(rng, n);
      for (let t = 0; t < 1500; t++) {
        if (t % 12 === 0) held = randomInputs(rng, n);
        // keep the squad alive so the whole game of mechanics keeps running
        if (t % 30 === 0) for (let s = 0; s < n; s++) if (w.pHp[s]! < 100 && w.pState[s] === 0) w.pHp[s] = w.pMaxHp[s]!;
        step(w, held);
        if (t % 25 === 0) {
          const err = check(w, `${MAPS[m]!.id} tick ${t}`);
          expect(err).toBeNull();
        }
        if (w.gameOver) break;
      }
    }
  }, 240_000);

  it('a bad squad on a vertical map can be snapshotted at any moment: the copy plays on identically', () => {
    for (const id of ['overpass', 'depot', 'rampyard', 'tunnelhub', 'mezzanine']) {
      const m = MAPS.findIndex((x) => x.id === id);
      const rng = new Rng(m * 31 + 5);
      const w = createGame({ seed: 7 + m, map: m, players: [0, 1, 2].map((s) => ({ slot: s, weapon: 'smg' as WeaponId, cls: 4 + s })) });
      setWave(w, 14);
      let held = randomInputs(rng, 3);
      for (let t = 0; t < 700; t++) {
        if (t % 10 === 0) held = randomInputs(rng, 3);
        for (let s = 0; s < 3; s++) if (w.pHp[s]! < 60) w.pHp[s] = w.pMaxHp[s]!;
        step(w, held);
      }
      const copy = createWorld(7 + m, m);
      restoreWorld(copy, serializeWorld(w));
      expect(hashWorld(copy), id).toBe(hashWorld(w));
      for (let t = 0; t < 300; t++) {
        if (t % 10 === 0) held = randomInputs(rng, 3);
        step(w, held);
        step(copy, held);
      }
      expect(hashWorld(copy), `${id} after playing on`).toBe(hashWorld(w));
    }
  }, 240_000);

  it('every class survives a lone fight on every map without ever breaking its own numbers', () => {
    for (let cls = 0; cls < CLASS_IDS.length; cls++) {
      const m = 6 + (cls % 5);
      const rng = new Rng(cls * 7 + 1);
      const w = createGame({ seed: 300 + cls, map: m, players: [{ slot: 0, weapon: 'pistol', cls }] });
      setWave(w, 20);
      w.pMaxHp[0] = w.pHp[0] = 1000;
      for (let t = 0; t < 900; t++) {
        const [inp] = randomInputs(rng, 1);
        if (w.pHp[0]! < 300) w.pHp[0] = 1000;
        step(w, [inp!]);
        if (t % 30 === 0) expect(check(w, `class ${CLASS_IDS[cls]} tick ${t}`)).toBeNull();
      }
      expect(w.pPerk.length).toBeGreaterThan(0);
      void BALANCE;
    }
  }, 240_000);
});
