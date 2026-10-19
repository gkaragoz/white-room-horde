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
WASD move, mouse aim, click or Space to fire. Query params: `?weapon=weapon_smg|weapon_ar|...`, `?acc=acc_helmet|acc_cap|acc_goggles|acc_headphones|acc_bandana`, `?color=0..10`.

## QA tool
`http://localhost:5173/qa.html` (add `?auto=1` to run on load). Seven automatic checks: assets load, animations finite, weapon held along the aim line and upright (every weapon x clip x 12 aim angles), sim shot origin equals the visual muzzle, WASD/aim/facing mapping, simulation determinism against the Node reference hashes (`packages/shared/data/sim-reference.json`), render performance. "Copy measured muzzle data" exports the measured muzzle offsets for `balance.json`. In the game, `?debug=1` or F2 shows the muzzle (red), the sim shot origin (yellow) and the aim line (blue). From a script: `window.__qa.runAll()`.

## Layout
- `packages/shared`  constants, wire types, balance data
- `packages/sim`     deterministic simulation (no DOM, no Three, no Math.sin/random/Date)
- `packages/client`  Vite + Three.js renderer, input, animation
- `packages/server`  (later) room and relay server
- `tools/`           Blender and Mixamo pipelines (see tools/mixamo/README.md)
