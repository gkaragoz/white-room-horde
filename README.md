# white-room-horde

A co-op top-down horde shooter that runs in the browser (Three.js). Up to 11 players, one deterministic simulation that every client runs in lockstep, a 30 Hz tick, and a floor that keeps climbing: clear a floor and the squad is lifted to the next one.

**Play:** https://gkaragoz.github.io/white-room-horde/ (solo works straight away, online needs nothing but the link)

Design notes: [docs/DESIGN.md](docs/DESIGN.md). How to extend the game (weapons, enemies, classes, cards, languages): [docs/EXTENDING.md](docs/EXTENDING.md). What changed in each version: [CHANGELOG.md](CHANGELOG.md).

## Playing online

1. Open https://gkaragoz.github.io/white-room-horde/ and press **Host game**. You get a 4-letter room code.
2. Friends open the same link, press **Join game** and type the code (or you send them `?join=CODE` after the link).
3. In the lobby the host picks the arena and difficulty, everybody picks a class and a colour, the host presses **Start**.

Nothing has to run on your computer: the room server is a Cloudflare Worker (`packages/relay`) and the page finds it by itself (`relay.json`). A dropped connection reconnects on its own, and a host who drops gets the host role back when they return. The settings panel has a **download report** button that saves a network/frame report for bug reports.

## The game

- **Floors.** Kill everything on a floor, watch the finisher (the camera pushes in on the last blow), then a short countdown and the squad is lifted to the next floor, which has a new arena. Every fifth floor has a boss. Enemies get tougher every floor, and harder still after floor 15.
- **Controls.** WASD move, mouse aim (auto aim picks the target, the cursor throws grenades), click / Space fire, right-click / G grenade, Shift dash, **F class ability**, R reload, 1-9 / Q weapons, E revive a downed friend, 1-3 pick a level-up card, P host pause, Esc pause. Gamepad and touch are supported (the ability is the right stick click on a pad and the ★ button on touch).
- **Guns (23) and blades (2).** From the pistol to the railgun, with crossbow, plasma rifle, rocket launcher, nail gun, auto shotgun, akimbo pistols, frost gun, saw launcher and arc thrower; the better ones unlock as your best floor goes up and drop as crates.
- **Classes (9).** Each has an ability on F that recharges: soldier (rally), medic (heal pulse), heavy (fortify), scout (burst), demolisher (airstrike), ranger (overcharge), berserker (rampage), and two melee classes with no guns: the swordsman (blade arc, blade storm) and the hammerer (hold to charge a full spin, ground slam).
- **Levels are per character.** Every kill gives experience to whoever made it; each level opens a choice of three cards for that character. Four cards help the whole squad and show on the info bar.
- **Enemies.** 31 types, from grunts to acid sprayers, rammers that throw you into the air, mortar crews, marksmen with laser lines, blinkers and magnetars; pouncers that mark one of you and leap, hurlers that pick up their own soldiers and throw them, grabbers that throw you across the room, spikers, shockers, trappers, warcallers, choppers and quakers. Eleven elite kinds (giant, swift, splitter, volatile, regenerating, armoured, berserk, vampiric, toxic, phantom, warded) and eleven bosses with telegraphed attacks (slams, meteors, acid, sweeping lines, a purge that paints most of the arena red, earthquakes, lightning storms, poison ground, leaps and thrown soldiers). Frozen enemies are coated in ice.
- **Arenas (11).** Six flat ones and five with two levels (bridges, platforms, 30 and 45 degree ramps and tunnels), all 104 x 70 units: room to run and to gather a crowd. A shot from a deck reaches the ground, not the other way round; the roof of a bridge turns thin while you stand under it.
- **After the run.** The game-over page counts the run in about thirty numbers, per player.
- **Sound.** Recorded and synthesised effects, music, and an announcer (English).

## Run it yourself

```
pnpm install
pnpm dev          # client at http://localhost:5173
pnpm test         # simulation, networking and server tests
pnpm typecheck
pnpm lint         # includes the determinism rules for packages/sim
pnpm build
```

Handy query parameters: `?solo=1` (start at once), `?map=N` (arena), `?wave=N` (start at floor N), `?weapon=weapon_smg|…`, `?join=ROOM`, `?bots=0..10`, `?auto=1` (scripted input), `?god=1` (no deaths), `?perf=1` (frame and simulation timing). Stress test: `?perf=1&wave=25&bots=7&auto=1&god=1`.

### Your own server

```bash
pnpm --filter @wrh/client build
pnpm --filter @wrh/server start                  # http://localhost:8787 (game + websocket)
cloudflared tunnel --url http://localhost:8787   # optional: a public address for friends
```

Open the page, host, and share the room code. With a tunnel, paste its address in the **Server** field of the menu (or open the page with `?server=wss://your-tunnel/ws`). `pnpm relay` starts a quick tunnel and publishes its address in `relay.json`, so the Pages site fills it in automatically.

### The permanent server

`packages/relay` is the same room server as a Cloudflare Worker (one Durable Object, free plan) at `wss://white-room-horde-relay.gkaragoz96tablet.workers.dev/ws`. A client and a server must have the **same `major.minor` version** (the simulation rules change between minors), so after every `pnpm release minor` redeploy it:

```bash
cd packages/relay
pnpm exec wrangler login      # once
pnpm exec wrangler deploy
```

### Releasing

`pnpm release minor` (or `patch`) moves the Unreleased notes of `CHANGELOG.md` under a new version, bumps `package.json`, commits and tags. `git push --follow-tags` publishes the GitHub release (with a zip of the game) and the Pages site (`.github/workflows/pages.yml`).

## Layout

- `packages/shared`  constants, wire formats, balance data (`data/balance.json`), the arena layouts
- `packages/sim`     the deterministic simulation (no DOM, no Three, no Math.sin/random/Date)
- `packages/net`     lockstep client session, room logic, wire protocol
- `packages/server`  Node room server (also serves the built game)
- `packages/relay`   the same room server as a Cloudflare Worker
- `packages/client`  Vite + Three.js renderer, input, UI, audio, the in-browser QA tests
- `tools/`           Blender, audio and CI scripts (see `tools/mixamo/README.md` for the animation pipeline)

## Quality checks

- `pnpm test`: simulation (determinism, enemies, bosses, classes and abilities, melee, ground effects, vertical arenas, prediction, replay, snapshots, a squad of bots playing to the end), lockstep networking over a simulated bad network (late join, rejoin, host recovery, input prediction) and a real-server end-to-end test with real WebSockets.
- `node tools/ci/qa-browsers.mjs chromium firefox webkit` (after `pnpm --filter @wrh/client build`): the in-browser QA page, about 70 checks in Chromium (animation data, rendered poses, every enemy and boss, ice, telegraphs, arenas, UI, strings in six languages, audio decoding) and the cross-engine determinism check in Firefox and WebKit.
- `node tools/ci/game-smoke.mjs chromium|firefox|webkit`: plays the real page with real keyboard and mouse events.
- `node tools/ci/check-dist.mjs`: the built game is complete and within its download budget.
- `http://localhost:5173/qa.html` runs the same QA checks by hand (add `?auto=1` to run on load; `window.__qa.runAll()` from a script).

## Credits and licences

- Game code: MIT (see `LICENSE`, which also states what the licence does not cover).
- Sound effects: mostly CC0 (rubberduck, Kenney, artisticdude, Ben Jaszczak and others) plus sounds synthesised for this game; **the announcer voice lines are CC-BY 3.0** by TripleSnail, recorded by Antti Saari. Full list in `packages/client/public/sfx/CREDITS.md`.
- Animations: retargeted from Adobe Mixamo clips and baked into the model files; Mixamo's terms allow use inside games but not redistribution of the animations on their own. The raw Mixamo downloads are not in the repository.
- Characters, weapons, enemies, props and arenas are procedural (built with the Blender scripts in `tools/blender`).
- three.js (MIT).
