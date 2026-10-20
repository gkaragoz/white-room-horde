# Performance notes

`node tools/ci/perf-spikes.mjs [seconds] [wave] [bots] [--profile] [--soft]` plays a scripted fight in headless Chromium and prints
frame-time percentiles, long tasks, garbage collections and (with `--profile`) the main-thread self time per function.
Headless Chromium on a machine without a GPU renders in software, so the frame times there only show relative changes; the
`--profile` list (JS self time) is what tells whether the game's own code is the problem.

## v0.16.0 (wave 3, 2 bots, 15 s, software renderer)

| | before | after |
|---|---|---|
| `texSubImage2D` (blood layer uploads) | 183 ms | 20 ms |
| per-hit materials/geometries created | one per flash, ring, swing | none (pooled) |
| ragdoll `apply()` allocations per frame | hundreds | none |
| damage numbers | element created and removed per hit | element pool |

What was changed: the blood layer is cut into tiles that upload one at a time instead of a 5 MB canvas every 0.2 s; flashes, shock
rings and melee slashes reuse meshes and materials; ragdoll bodies of the common enemy types are built and compiled at load; the
ragdoll pose code reuses scratch objects; the sound bank keeps its list of decoded files; the HUD no longer rebuilds elements
every update (the browser re-serialises innerHTML, so comparing against it never matched).
