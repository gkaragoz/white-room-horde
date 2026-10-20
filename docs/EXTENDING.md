# Extending the game

Everything that decides how the game plays is data plus a small amount of simulation code in `packages/sim`. The
client only draws what the simulation says. After any change to the simulation rules:

```bash
cd packages/sim && UPDATE_REF=1 pnpm vitest run     # regenerate packages/shared/data/sim-reference.json
pnpm test && node tools/ci/qa-browsers.mjs chromium
pnpm release minor                                  # then: git push --follow-tags
pnpm --filter @wrh/relay deploy                     # the public relay must run the same major.minor
```

The sim is deterministic (no `Math.sin`, `Math.random`, `Date`; use `detmath` and `w.rng`), so every client computes the
same world from the same inputs. Anything stored in the world must be in `snapshot.ts` (`arrays()`) and in the hash
(`hashWorld` in `sim.ts`).

## A new weapon
1. `packages/shared/src/types.ts`: add the id to `WeaponId` and `WEAPON_IDS` (append, never reorder) and to `WEAPON_RANK` (weakest to strongest: the number keys and the inventory list follow it).
2. `packages/shared/data/balance.json` `weapons.<id>`: damage, rate, pellets, spread, range, pierce, magazine, reload, ammo
   (`-1` infinite). Keep sustained DPS inside the band checked by `packages/sim/tests/weapons.test.ts` (40 to 100).
   `blast` and `blastDamage` make the round explode where it ends.
3. Model: add a function to `tools/blender/make_weapons.py` (grip at the origin, barrel along -Y) and run it with Blender.
4. Run the QA page (`weapon.alignment`) and copy the measured muzzle numbers into `balance.json`
   (`muzzleFwd`, `muzzleSide`, `muzzleH`); `weapon.head-clearance` must pass.
5. Client: name in `ui.ts` (`weapons`, both languages and `i18n.ts`), `WEAPON_UNLOCK` in `profile.ts`, tracer in `TRACER`
   (`main.ts`), sound entry in `GUNS` (`audio.ts`, files `public/sfx/gun_<id>_<n>.ogg` and `.mp3`, see `tools/audio`).

## A new enemy type
1. `types.ts`: `EnemyType` and `ENEMY_TYPES` (append). `balance.json`: `enemies`, `waves.unlock`, `waves.weights`,
   `progression.xp`.
2. Behaviour in `packages/sim/src/enemies.ts` (movement, special attacks, death effects in `killEnemy`).
3. Model: `spec_<name>` in `tools/blender/make_chibi.py` and the entry in `SPECS`; animations: add it to `TYPES` in
   `tools/blender/bake_vat.py` and run the bake (needs the local Mixamo files in `./mixamo`).
4. Client: the clip table `CLIPS` in `render/crowd.ts`, gib colour in `render/fx.ts`.

## A new card
1. `types.ts`: `CARD_IDS`, `CARD_RARITY`, `PERSONAL_CARDS`. Effect: a `case` in `applyCard` (`progression.ts`), usually a
   perk slot (`PERK` in `types.ts`, helpers in `features.ts`).
2. Texts in `ui.ts` and `i18n.ts` (`cards`), art with `tools/blender/make_cards.py` (`ICONS`).

## A new language
Add an entry to `EXTRA` in `packages/client/src/i18n.ts` and to `LANGS` in `ui.ts`. Missing keys fall back to English;
the `ui.strings` QA test checks the array lengths and that most strings really differ from English.

## Replays and score checking
`Recorder` stores the confirmed inputs and a hash every 30 ticks. `verifyReplay(replay, finalHash?)` runs it again and
reports the first checkpoint that does not match. A leaderboard server can call it on every submitted replay (the sim is
plain TypeScript and runs in a Worker or in Node).

## Floors (the climb between rooms)
A floor ends only when every enemy of it is dead. `runWaves` in `packages/sim/src/enemies.ts` is a small state machine kept in
`world.misc` (`MISC.Phase`, `MISC.PhaseEnd`; phases in `FloorPhase`): fight, a 5 s "cleared" countdown, the ascent (a short
charge, then the lift; the world is rebuilt for the next map half way, `enterFloor`) and a 5 s arrival countdown before the
next floor's enemies come. Timings and the health of revived players are in `balance.json` `floors`. During the ascent the sim
ignores movement and fire inputs. The client draws it from the same state (`render/floorFx.ts`: two floors stacked
`FLOOR_GAP` apart, rune circle and light beam, speed lines, dissolve shader in `render/reveal.ts`, vertical motion blur in
`render/stage.ts`), so online clients and late joiners always agree with the sim.
