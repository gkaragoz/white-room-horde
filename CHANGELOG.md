# Changelog

Newest first. `pnpm release minor` (or `patch`, `major`) moves the Unreleased notes under a new version and tags it; the
GitHub release for that tag is published automatically with the notes below and a zip of the built game.
Multiplayer needs the same `major.minor` on the server and on every client (the simulation rules may change between
minors), so a minor bump means: update the server and reload the page.

## Unreleased

## v0.5.3 (2026-10-20)

**Loot**
- Drops spin on the spot and carry a name tag; weapon drops show the actual gun.
- Rarity glow like the cards: white (ammo, grenade), blue (health, shield, haste, light weapons), purple (quad, freeze, heavy weapons), red (nuke, minigun): coloured outline, floor ring and tag.

## v0.5.2 (2026-10-20)

**Models**
- Loot dropped by enemies (ammo box, medkit, grenade, weapon case, shield, speed bolt, quad crystal, nuke, ice crystal) is now a chunky TF2-style Blender model (`tools/blender/make_pickups.py`) instead of plain shapes.
- Fix: the barrel walls were removed by the buried-face check (you could see inside); the check now needs the whole face to be buried.

## v0.5.1 (2026-10-20)

**Models**
- Flicker fix: props, weapons and hats now go through `tools/blender/meshclean.py` (weld, outward normals, buried and coplanar faces removed or lifted, ground-plane bottoms dropped so barrels no longer fight with the floor). `tools/blender/audit_meshes.py` checks every GLB.

## v0.5.0 (2026-10-20)

**Waves**
- A wave now has a fixed number of enemies: they arrive in a rush (30%) and then as a stream over 25 seconds, and killing them does not make new ones appear. Clear the wave and you get a breather: the next wave starts at most 15 seconds later (or when the clock runs out if you are slower). The HUD shows how many enemies are left, and a "Wave cleared!" banner appears.

**Aiming**
- Grenades land where your cursor is (up to 14 units; with a gamepad they fly their normal range) and a ring the size of the blast marks the spot on the floor. The cursor distance travels with the input (one extra byte), so everybody in the room sees the same throw.
- Rockets and grenade launcher shells burst on the first enemy they hit; piercing upgrades no longer carry them through.
- The ammo ring is a real object on the floor now: it passes behind the character and the enemies. The rounds-left label no longer floats above menus and cards.
- The system pointer is hidden over the game and replaced by a soft, thick ring that swells and settles (ease-out-back) on every shot and click.

**Settings and controls**
- The settings window is rebuilt: tabs (Graphics, Audio, Gameplay, Accessibility, Keys), grouped rows with switches, sliders and segmented choices, a reset button, and many more options (screen shake, hit-stop, damage numbers, kill streak announcer, ammo ring, name tags, minimap, frame rate display, particle and blood amount, how long corpses stay, separate sound effect and zombie voice volume, menu sounds).
- A controls button next to the settings button opens a sheet with every control drawn as keycaps (and the mouse) with what it does, following your key bindings, plus the gamepad layout.
- P pauses the game for the whole room (host only), P again resumes; in a solo game it pauses too.
- Dead enemies disappear after a few seconds (you can change how long); only the blood stays.

## v0.4.0 (2026-10-20)

**Feel**
- Bullets are slim again (the glow and the damage upgrades no longer blow them up); the flamethrower shoots soft flame puffs and the grenade launcher a round shell.
- A short freeze on heavy kills (solo; online only the visuals slow down), slow motion for boss deaths and nukes, weapon recoil, ejected brass, a ring on the floor under heavy hits, and a red arc on the screen edge showing where a hit came from.
- The camera is a lot further away (42 units wide) for a roomier play area.
- Rain on some night waves (setting).

**Balance**
- Weapons rebalanced into one band of sustained damage per second (a test keeps it that way): the minigun and heavy machine gun are calmer, the revolver, pistol, double barrel and grenade launcher hit harder, the flamethrower pierces less.

**Under the hood**
- Six interface languages (English, Turkish, German, Spanish, French, Russian), a colour-blind palette with numbered name tags and three text sizes.
- Installable and offline friendly (manifest, icon and a service worker that caches models, sounds and card art per version).
- A budget check for the build (download size, script size) in CI and a QA test for lights, draw calls, triangles and particles.
- `verifyReplay` re-runs a recorded game and checks every checkpoint hash (the base for a server-side leaderboard); replay files now also store the map, difficulty and classes.
- `docs/EXTENDING.md` explains how to add a weapon, an enemy, a card or a language.

## v0.3.1 (2026-10-20)

- Four new enemy kinds with their own Blender models and baked animations: crawlers (fast, low, from wave 4), leapers (jump at you every few seconds, wave 6), bloaters (slow and fat; when they die the belly bursts, burns whoever is close and a litter of crawlers crawls out, wave 9) and screamers (speed up every enemy around them, wave 12).
- Smoke and fire are soft round puffs instead of cubes; the bullet glow is round too.

## v0.3.0 (2026-10-19)

**Night, light and chaos**
- Night mode and a day and night cycle (four waves of day, four of night; or pick day or night in the settings). Real-time lights: every muzzle flash and explosion lights the arena, street lamps, campfires and neon signs glow, and the local player carries a flashlight cone at night. A setting turns the real-time lights off on weak machines.
- Bullets are bigger, brighter and surrounded by a glow (even brighter at night). Hits on cover throw sparks, chips and dust and leave bullet holes on the walls; misses dig little pits in the ground with a puff of dust.
- The camera is further away. A ring around your feet shows the rounds left in the magazine (green when full, red when empty, with 7/15 beside it, and it spins while reloading).
- Physics and gore turned up: every hit shoves enemies back, blasts fling the survivors, almost every kill is a physical ragdoll and a blast launches nearby bodies high and far, bigger and more gibs and blood. Explosive barrels stand around the arena: shoot one and it chains into its neighbours, hurts you too and comes back after 40 seconds.
- Kill streaks: a counter on the right and an announcer (Killing spree, Rampage, Unstoppable, Massacre, Godlike, Apocalypse). The game over screen lists every player's kills and the MVP.

**Classes and cards**
- Seven classes picked in the menu or lobby: Soldier, Medic (heals allies nearby, revives faster), Heavy (big, slow, tough), Scout (fast, dashes often), Demolisher (more grenades, bigger blasts), Ranger (damage and piercing), Berserker (stronger as health drops, heals on kills). Heavy and scout also look bigger and smaller.
- Out of combat everybody now regenerates a little.
- Ten new cards, all with Blender art: Regeneration, Thorns, Shockwave (your dash blasts), Volatile rounds (kills explode), Frost aura, Scavenger, Adrenaline, Barrier (rechargeable shield), Second wind (stand up once instead of going down), Rage. That makes 35.
- Five new power-ups that drop from enemies: shield orb, haste, quad damage, nuke and time freeze.

**Enemies and arenas**
- Elite enemies from wave 3: giants, swift ones, splitters, volatile ones that blow up, regenerating and armoured ones, each looking different. Every wave can carry a modifier: swarm, armoured horde, fast and furious, bounty wave (twice the loot) or elite storm.
- Two new arenas, Ruins and Factory (six now), with their own scenery.
- 14 new head accessories (pirate, wizard, viking, santa, chef, astronaut, cat ears, halo, alien antennae, gas mask, beanie, samurai, shades, flower crown) and 14 new props (pine tree, rocks, hay bale, dumpster, tent, generator, wreck car, tombstone, campfire, fuel tank, picnic table, neon sign, radio tower, skull pile).

## v0.2.1 (2026-10-19)

- Main menu polish: two columns, a big Play button, little top-down pictures of every arena (painted from the real layouts) and a difficulty row with skull icons (one, two or three skulls). The lobby shows the same pictures and skulls.

## v0.2.0 (2026-10-19)

**Weapons**
- Six new weapons: revolver, machine pistol, double barrel, marksman rifle, flamethrower and grenade launcher (explosive rounds). Thirteen weapons that really play differently: fire rate, damage per round, spread, range, piercing, magazine and reload all differ, the pistol is calm now (about 3 shots a second) and magazines are limited everywhere. New weapons unlock with your best wave.
- Weapon pages in the menu show icon, bar and number for damage, rate, DPS, range, accuracy, magazine, reload, piercing or blast, and ammo reserve.
- Real recorded gunshots for every weapon (CC0), per-gun reload sounds, a little room reverb on gunfire and explosions.
- Bullets spawned next to a wall no longer start behind it, and enemies closer than the muzzle can be hit.
- Weapons are held lower and further out, so scopes, sights and stocks no longer cut into the big head (new `weapon.head-clearance` QA test).

**Look**
- Neutral daylight instead of the amber light, cool concrete floor, colourful cover per arena.
- 3D scenery: a fence of barriers around the arena, themed props outside (containers, crates, barrels, tyres, benches, plants, lamps) and little scenes on top of cover boxes. The models are overlap-free, no flickering faces.
- Eight new head accessories: crown, devil horns, top hat, cowboy hat, ninja band, mohawk, bunny ears, cyber visor.
- Every upgrade is visible: an orbiting gem per upgrade, a shield bubble for armour, the magnet's pull radius, a bigger body for health, fatter, redder, longer tracers for damage and piercing, bigger muzzle flashes, drifting sparkles for the soft upgrades.
- The camera is further away (24 units wide), camera shake is about half as strong, arrows on the screen edge point at teammates who are out of view.

**Loading and weapon slots**
- A loading screen with a progress bar and the data counter (for example 12,448 KB / 15,496 KB) appears while the game downloads; the files are cached for the game's own loading afterwards.
- Two weapon slots: your main weapon and a pistol as sidearm. Q (or 1 / 2, gamepad Y, a touch button) switches. When the main weapon runs completely dry the game falls back to the pistol by itself and takes the main weapon back when you pick up ammo; ammo crates refill the main weapon even while the pistol is out. Weapon crates replace only the main weapon.

**Co-op**
- Reviving shows a round progress ring over the downed player (green: revive, red: time before they bleed out). Letting go or walking away interrupts it, the progress drains and you can try again; the helper is slower and cannot shoot while reviving.
- Invite link: the lobby copies a link that opens the page with the room code and server filled in.

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
