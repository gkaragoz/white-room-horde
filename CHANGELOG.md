# Changelog

Newest first. `pnpm release minor` (or `patch`, `major`) moves the Unreleased notes under a new version and tags it; the
GitHub release for that tag is published automatically with the notes below and a zip of the built game.
Multiplayer needs the same `major.minor` on the server and on every client (the simulation rules may change between
minors), so a minor bump means: update the server and reload the page.

## Unreleased

- Permanent public relay: the room server also runs as a Cloudflare Worker (`packages/relay`), and the Pages build finds it through `relay.json`.

## v0.1.0 (2026-10-19)

First public version.

**Game**
- Top-down co-op horde survival for 1 to 11 players: 7 enemy types, 4 boss looks with their own abilities, waves, loot (ammo, health, grenades, weapon crates), magazines and reloading, dash, grenades, cover, downing and reviving teammates.
- 8 weapons (pistol, SMG, assault rifle, shotgun, heavy MG, minigun, sniper), 4 arenas, 3 difficulties, unlockable starting weapons and saved records.
- 25 upgrade cards (18 for the team, 7 personal) in three rarities, each with a Blender-rendered illustration.
- Crowd rendering with vertex-animation textures (500+ animated enemies at 150+ fps), baked death animations, physical ragdolls, blood, gibs, explosions, a persistent blood decal layer, an x-ray outline for players hidden behind scenery or enemies.
- Recorded CC0 sound effects and music, positional audio, zombie voices, footsteps, a music mix that follows the intensity of the fight.
- 3D character and weapon preview in the menu and lobby: arrows change the accessory and the starting weapon (with its stats), swatches pick the vest colour, drag to turn it; everyone in a room sees your colour and accessory.
- Keyboard and mouse, gamepad and touch controls, key rebinding, English and Turkish.
- Graphics settings: WebGL2 or WebGPU, anti-aliasing (off, MSAA, SMAA), shadows, render scale, auto resolution, frame limit, texture detail, bounce light.

**Online**
- Deterministic lockstep with a small relay server: rooms with codes and optional passwords, host-only options, late joining and rejoining the same slot by snapshot, desync detection and recovery, rate limits and validation.
- The Pages build finds the public relay by itself: `pnpm relay` starts the tunnel and publishes its address (`relay.json`), the menu reads it and fills in the server field, so players on different networks can join each other.
- The version badge in the corner shows the build; a client and a server on different `major.minor` versions refuse each other with a clear message.

**Quality**
- Simulation tests (determinism, replays, snapshots, random-play invariants), lockstep tests over a simulated bad network, a real-server end-to-end test, and an in-browser QA page run in Chromium, Firefox and WebKit by CI. Simulation hashes are identical on V8, SpiderMonkey and JavaScriptCore.
