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

## Layout
- `packages/shared`  constants, wire types, balance data
- `packages/sim`     deterministic simulation (no DOM, no Three, no Math.sin/random/Date)
- `packages/client`  Vite + Three.js renderer, input, animation
- `packages/server`  (later) room and relay server
- `tools/`           Blender and Mixamo pipelines (see tools/mixamo/README.md)
