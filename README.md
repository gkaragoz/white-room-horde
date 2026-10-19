# white-room-horde

Co-op top-down survival shooter (web, Three.js). Design: [docs/DESIGN.md](docs/DESIGN.md).

## Run
```
pnpm install
pnpm dev          # client at http://localhost:5173
pnpm test         # sim unit tests (determinism, rng, math)
pnpm typecheck
pnpm lint         # includes the determinism rules for packages/sim
pnpm build
```
WASD move, mouse aim, click or Space to fire, right-click or G for a grenade, E to revive a downed teammate, 1-3 to pick a level-up card. Query params: `?weapon=weapon_smg|weapon_ar|...`, `?acc=acc_helmet|acc_cap|acc_goggles|acc_headphones|acc_bandana`, `?color=0..10`, `?perf=1` (frame/sim ms, draw calls, triangles), `?wave=N` (start at wave N), `?bots=0..10` (scripted extra players), `?auto=1` (scripted input for you), `?god=1` (no deaths). Stress test: `?perf=1&wave=25&bots=7&auto=1&god=1`.

## QA tool
`http://localhost:5173/qa.html` (add `?auto=1` to run on load). Seven automatic checks: assets load, animations finite, weapon held along the aim line and upright (every weapon x clip x 12 aim angles), sim shot origin equals the visual muzzle, WASD/aim/facing mapping, simulation determinism against the Node reference hashes (`packages/shared/data/sim-reference.json`), render performance. "Copy measured muzzle data" exports the measured muzzle offsets for `balance.json`. In the game, `?debug=1` or F2 shows the muzzle (red), the sim shot origin (yellow) and the aim line (blue). From a script: `window.__qa.runAll()`.

## Layout
- `packages/shared`  constants, wire types, balance data
- `packages/sim`     deterministic simulation (no DOM, no Three, no Math.sin/random/Date)
- `packages/client`  Vite + Three.js renderer, input, animation
- `packages/server`  (later) room and relay server
- `tools/`           Blender and Mixamo pipelines (see tools/mixamo/README.md)


## Play online
```bash
pnpm --filter @wrh/client build
pnpm --filter @wrh/server start        # http://localhost:8787 (game + websocket relay)
cloudflared tunnel --url http://localhost:8787   # optional: share a public link
```
Open the page, "Host game" gives a 4-letter room code, friends use "Join game" with the code (the server field defaults to the page's own host). For development run `pnpm dev` (client on 5173) next to the server; the menu then defaults to `ws://localhost:8787/ws`. Late joiners fast-forward through the stored input history; the server compares state hashes every second and flags desyncs.

Tests: `pnpm test` (sim determinism, enemies, replay, lockstep with simulated latency), `pnpm lint`, `pnpm typecheck`.
