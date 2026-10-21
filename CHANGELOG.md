# Changelog

Newest first. `pnpm release minor` (or `patch`, `major`) moves the Unreleased notes under a new version and tags it; the
GitHub release for that tag is published automatically with the notes below and a zip of the built game.
Multiplayer needs the same `major.minor` on the server and on every client (the simulation rules may change between
minors), so a minor bump means: update the server and reload the page.

## Unreleased

**A roomier main menu and a new icon set (client only; nothing changes in the rules or on the wire)**

- The main menu is now full screen: the name and big Play solo / Play online / Settings buttons on the left, the 3D character stage with the nine classes in the middle, arenas and difficulty on the right, the starting weapons as icon tiles. Online play (host, room code, password, server) moved into its own window; an invite link opens it with the code filled in. Calm white-room background with slow drifting bubbles. Phone layouts (portrait and landscape) with touch-sized buttons. The markup and styles live in `packages/client/src/menu.ts`, the element ids the QA scripts use stayed the same.
- A new icon set drawn in Blender (`tools/blender/icon_kit.py`, `make_icons.py`): 80 raised toy-style badges as 128 px WebP in `public/icons` (about 470 KB in all) for the classes, weapon statistics, HUD buttons, squad chips, toolbar, difficulty skulls and the 25 game-over statistics, replacing the emoji, Unicode glyphs and inline SVGs. `packages/client/src/icons.ts` turns a name into the markup. The app icon is a PNG (192 and 512) as well.
- The release notes window opens by itself the first time a returning player starts a new version (once per version; the first-ever visit and the version number in the corner behave as before).
- New `tools/ci/menu-shots.mjs`: screenshots at desktop, laptop and phone sizes plus layout checks; `notes-check.mjs` covers the automatic opening; the other browser scripts mark the notes as seen so the window does not cover the menu.

## v0.20.1 (2026-10-21)

**Weak machines and releases without chores**

- Slow computers: the horde outside the camera is no longer sent to the graphics card, a quality governor lowers particles, gore, lingering corpses and the horde's shadows in three steps when the frame rate still sags at the lowest resolution (and raises them again), and a client that fell behind the server spends a bigger slice of each frame catching up. The simulation itself was measured at about 1.5 ms per tick with 510 enemies, so it was left alone (`packages/sim/scripts/bench.ts`).
- The browser checks `play-all`, `aim-check`, `notes-check` and `net-stutter` run in CI as well.
- New `relay` workflow: pushing a version tag deploys the Cloudflare relay and checks that it reports the new version (needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; without them it only warns). See `docs/RELEASING.md`.

## v0.20.0 (2026-10-21)

**Online movement without stutter (the input message changes: update the server and reload the page)**

- Fixed the stutter of the local character in online games, worst with the hammerer. Causes: the client's prediction ignored the slow-down of a charging hammer (and the Special button, and buffs running out inside the lead window) so it overshot and was pulled back on every confirmed tick; the predicted position was drawn on the clock of the received bundles instead of the clock of the sent inputs, which made it jump back and forth by a tick of movement about thirty times a second; and the smoothing filter passed most of each jump through.
- `predictPlayer` now shares its charge/cooldown logic (`chargeStep`) and buff arithmetic with the simulation, and a test proves it equals the simulation tick for tick for all classes on a flat and a layered map, with Fire held and released, dashes, revive, the Special button and expiring buffs.
- New `PredictedView` (packages/net/src/smoothing.ts): the local character is drawn between the positions after its last two sent inputs on the input clock; a misprediction is turned into an error offset that eases out in about 0.1 s; only a big error (over 2.5 units) snaps.
- Network layer: input tags are strictly increasing (two inputs can no longer share a tag), every input message repeats the last four inputs and the room fills only the ticks it is missing (a lost or late message no longer changes what your character does), the input lead follows round trip and jitter with hysteresis (up at once, down one tick per 3 s) and has one more tick of margin, the playout buffer and the playback speed are smoothed (no more +-12% saw-tooth), a hitch that delivers the page's input timer ticks back to back sends one input instead of a burst, the host serialises a snapshot after the message handler instead of inside it, and the relay and the Node server make up at most two ticks per timer firing and re-anchor when more than three behind.
- Diagnostics: the F4 report and `window.__wrh.netstats()` show corrections, snaps, the biggest error, the input lead, input lateness, backward steps and the 99th percentile of the speed the local character was drawn at.
- New `tools/ci/net-stutter.mjs`: two browsers against the local server through a delaying proxy (latency, jitter, stalls), a hammerer walking with the fire button held.

## v0.19.1 (2026-10-21)

- The version number in the corner is clickable: it opens a window with the release notes in plain words, in the interface language (and it follows the language when you change it while it is open). Esc or a click outside closes it.

## v0.19.0 (2026-10-20)

**More of everything: 10 enemies, 5 elites, 5 bosses, 10 guns, harder floors (rules and wire format change: update the server and reload the page)**

- Ten new enemies: the **pouncer** marks one player and leaps onto the spot, the **hurler** picks up its own soldiers and throws them at you, the **grabber** catches you and throws you across the room, the **spiker** shoots a fan of spikes, the **shocker** pulses a ring of lightning, the **brood** mother bursts into crawlers, the **trapper** lays mines, the **warcaller** blows a horn and calls reinforcements (and speeds its horde up), the **chopper** throws an axe that comes back, the **quaker** stomps and rains rocks.
- Five new elite kinds: berserk (frenzy every few seconds), vampiric (heals when it hits), toxic (leaves acid), phantom (dodges some hits), warded (a shield before its health). Elites are more common.
- Five new bosses (eleven in all, old and new mixed so a new one comes early): the iron colossus (earthquakes), the storm caller (lightning), the plague doctor (poison ground, broods), the stalker (leaps, cuts lines) and the warlord (throws its soldiers, war cries).
- Ten new guns: railgun, crossbow, plasma rifle, rocket launcher, nail gun, auto shotgun, akimbo pistols, frost gun (freezes what it hits), saw launcher and arc thrower. Models, icons, sounds, unlocks and names in six languages. The starting weapon list and the weapon crates know them all.
- Harder and busier floors: three times the enemies (cap 510), they arrive faster, enemies grow tougher sooner and hit harder after floor 10.
- A boss that smashes the ground no longer says "Reinforcements!": every boss attack has its own banner. The last-kill statistics also know the ten new guns; texts reviewed ("Reached floor", the controls line mentions the ability key, elite names in all languages).
- The wire format of a joining player and of a replay got room for more than 16 weapons.

**Aim fixes**

- Auto aim only turns the character while you shoot (and for a third of a second after): standing still, the character no longer swings round to whichever enemy happens to be nearest. It only locks on enemies in reach of the weapon, holds a lock against near equals (a nearer one must be a third closer, or the old one dead or blocked for six ticks) and leads moving targets with a calmer estimate.
- The body turns to the angle that is actually being shot, and manual aim now sends the bullet through the cursor from the muzzle instead of alongside it.
- A wall beside the barrel no longer eats a shot: only a wall in front of the muzzle stops it. Close targets are aimed at from the middle of the character so they cannot be missed by the barrel's offset.

## v0.18.0 (2026-10-20)

**Bigger arenas, a built and demolished floor, a game-over page full of numbers (rules change: update the server and reload the page)**

- Every arena is about three times the area (104 x 70) and was redrawn for it: open ground to run in and gather a crowd, cover, lanes, choke points, bridges and tunnels. A map test checks that no pocket is sealed off, the rim is open to the crowd and every deck can be reached.
- Moving between floors: the climb now floats through a stretch of empty sky while the next floor is made ready, and a bug is gone that rebuilt the upper floor with the wrong arena just before arrival (the old map showed for a moment, then changed).
- During the countdown after a clear the old arena breaks up piece by piece and falls away, and after the climb the new one drops out of the sky piece by piece with a puff of dust and a sound for every piece.
- The game-over page counts everything: damage dealt and taken, health regained, the biggest hit, crits, shots, swings, grenades, barrels, revives, pickups, dashes, abilities, distance run, boss kills, times downed, favourite weapon, kills per minute, mouse clicks, keys pressed, the longest combo and more. The cards appear one after the other with a tick and a count-up (a click shows them all), and in a squad a tab per player switches the page.
- Fixed a flow-field limit that would have broken pathfinding on the bigger arenas.

## v0.17.0 (2026-10-20)

**Juice and gore (rules change: update the server and reload the page)**

- Fewer, chunkier enemies: smaller waves (cap 170) with more health, and the fast ones are slower (runner 6, crawler and leaper 5, exploder 5.5, blinker 5) so you outrun everything by about 2x.
- Heads, arms and legs fly off hard kills (Settings, Blood and gibs: none on low, some on normal, plenty on extra), with blood pumping from the stump, a trail of drops and a splat where the part lands. Hits and kills spray more blood.
- New sounds: bone cracks, wet hits, a decapitation, a limb torn off, a body bursting (all synthesised for the game).
- Melee feels heavier: a freeze and a camera kick when a swing connects, blade cuts alternate from side to side, the body steps into the swing and twists with it, the hammer trembles when fully charged, the weapon settles back after the swing.
- Dead enemies no longer drift toward where they died while they fade; they sink into the floor where they lie.

## v0.16.0 (2026-10-20)

**Melee fixes, a cleaner HUD and fewer frame spikes (rules change: update the server and reload the page)**

- Blades and hammers set barrels off. They can no longer take guns or ammo (the loot stays for the others, and a squad of only melee classes stops getting gun and ammo drops). The swordsman and the hammerer regenerate much faster and take less damage.
- A charging swing shows a bar over the character (and only while charging).
- Bottom right is tidier: grenades, dash and the class ability (with its own name, no longer labelled "Dash") sit under the weapon list, each with a hover tip. The weapon list can be clicked. The controls line at the bottom is gone, the round buttons at the top right say what they are when hovered.
- The save-replay button is gone.
- Fewer frame spikes in fights: pooled flashes, rings and slashes, a tiled blood layer, ragdolls compiled at load, less garbage per frame. New `tools/ci/perf-spikes.mjs` and `docs/PERF.md`.

## v0.15.1 (2026-10-20)

**Test pass and a fix**

- Fixed: an enemy or player could be left on a bridge level with no bridge under it (found by the new random-play tests); they now drop to the ground. Everybody in a room should reload to 0.15.1.
- New tests: random squads on every arena at high floors, a three-client run against the live relay, and a browser play-through of all nine classes, the five vertical arenas, the finisher and the menu (`tools/ci/play-all.mjs`).

## v0.15.0 (2026-10-20)

**Verticality: ramps, bridges, tunnels (rules change: update the server and reload the page)**
- Five new arenas with a second level: *Overpass* (a long bridge with 30 degree ramps at both ends, the ground runs under it between pillars), *Depot* (a raised platform with a tunnel through it, a long ramp and a steep one), *Ramp yard* (two plateaus reached by 30 and 45 degree ramps), *Tunnel hub* (a bank with three tunnels) and *Gallery* (a mezzanine on pillars). They join the floor rotation after the six flat ones.
- Everybody is on the ground or on a deck and walks between them by the ramps (the grade is 30 or 45 degrees: climbing is slower the steeper it is, going down is a little faster); a deck has rails and no edge to fall off. Characters, the camera, the aim cursor, bullets, loot, name tags and the ammo ring follow the real height.
- Fighting across the levels: a shot from a deck reaches the ground below, a shot from the ground does not reach a deck (the auto aim leaves such targets alone); melee only reaches the level it is made on; enemies cannot hit you across levels but they find the ramps (the flow field has two levels joined by the ramps), come up after you and down after you; pillars and tunnel walls stop the ground, rails stop only walking.
- The roof of a bridge or gallery turns thin while you stand under it, the minimap shows decks (lighter) and ramps (a gradient to their high end) and draws enemies on a deck as rings.
- The gamepad's Special button is the right stick click.

## v0.14.0 (2026-10-20)

**Classes, abilities, melee and an announcer (rules change: update the server and reload the page)**
- Every class has an ability on the new Special key (F; ★ button on touch, Y on a gamepad) that recharges: the soldier rallies the squad (faster fire and steps), the medic sends out a heal pulse, the heavy fortifies (a third of the damage, cannot be thrown), the scout bursts (much faster, dash ready), the demolisher calls an airstrike (six marked blasts that hurt enemies only), the ranger overcharges (piercing shots, double damage), the berserker rampages (more damage, faster, cannot be stunned). The cooldown is on the HUD.
- Two melee classes with no guns: the *swordsman* (a broad arc in front of him, blade storm: spins and hits everything around) and the *hammerer* (a heavy hammer: hold to charge, let go for a full spin that hits harder the longer it was held; ground slam). New weapons models, icons, swing streaks, arm swing and sounds; gun crates heal them, ammo crates become grenades.
- Announcer voice lines for first blood, kill streaks (killing spree, rampage, dominating, massacre, godlike, mayhem), crowd kills, nukes, boss kills, a boss on the way and the final blow of a floor (English, "Announcer kill sounds" by TripleSnail, recorded by Antti Saari, CC-BY 3.0; credited in the sounds list). It follows the announcer setting and the voice volume.
- Input is 10 bytes now (16 button bits), classes are 4 bits on the wire (up to 16): older replays can no longer be played.

## v0.13.0 (2026-10-20)

**Ten new enemies, ice, two new bosses (rules change: update the server and reload the page)**
- Ten new enemy types, each with its own model, carried prop and way of fighting, joining the waves from floor 8 up to floor 24: the *acid sprayer* (a tank on its back, leaves acid behind it and spits puddles), the *rammer* (a bull: stops, trembles and swells with a charge bar, then runs dead straight and throws everything it meets into the air, players stunned, enemies tossed as ragdolls), the *mortar grenadier* (keeps its distance and lobs a salvo of marked shells), the *sledge brute* (a giant hammer: marked slam, shockwave throw), the *lamp spinner* (winds a street lamp up and sweeps a 360 degree circle), the *reviver* (a shaman that keeps away and calls crawlers), the *marksman* (a long thin laser line, then a very hard hit), the *blinker* (teleports behind you), the *magnetar* (pulls everybody toward itself) and the *flamer* (a stream of fire on the ground).
- Frozen enemies are covered in ice: a blue-white coat creeps up from the feet (noise-broken, a little sparkle), crystal shards (modelled in Blender) grow out of the body, and when the freeze ends the ice melts away and shatters with a sound.
- Charge bars over the heads of enemies that are winding up a big move; their windups shake and glow.
- Two new boss looks: the meteor lord (spiked rock crown, molten shoulders) and the purger (a halo, one big red eye).
- The download grew by about 10 MB (baked animations).

## v0.12.0 (2026-10-20)

**New mechanics (rules change: update the server and reload the page)**
- Bosses fight with telegraphed area attacks: a red outline appears on the ground, a hatched fill spreads over it and the blow lands when it is full (a dash through it dodges it). Slams around the boss, meteor rain on the squad, acid pools that stay, a sweeping line across the arena and the purge: most of the arena (about 60%, as a disc around the boss or as a slab from one side) slowly paints red, and everybody still standing in it loses half their health (all of it from floor 35). Two new bosses (the meteor lord and the purger) join the cycle, which now has six.
- Players can be thrown: knocked-back characters fly away and are stunned (no steering, no shooting, no dash) for a moment. The client prediction follows it exactly.
- Frozen enemies are frozen one by one now (they stand still, no attacks) and thaw with a sound; acid and fire puddles burn whoever stands in them.
- The last enemy of a floor ends with a finisher: the camera pushes in between the character that landed the blow and the enemy, effects slow down, bars and a vignette frame it with the name of whoever struck, then it pulls back out and the floor-clear countdown starts after it (everybody holds still meanwhile, so it is the same on every machine).
- Past floor 15 enemies hit harder (6% per floor) and are tougher (2.5% per floor), so a strong squad keeps being tested. A headless bot squad test keeps the balance honest.
- New sounds: telegraph warnings, slam, purge, acid splash, throw.
- Concept renders of vertical arenas (ramps, bridges, tunnels) in tools/blender/out/arena_previews (not in the game yet).

## v0.11.0 (2026-10-20)

**Feel and fixes (rules change: update the server and reload the page)**
- Client-side prediction: online, your own character, the camera, flashlight and ammo ring follow your steering and dashes at once (the pending inputs are replayed on top of the confirmed state, mispredictions are eased out), and with auto aim off the character turns with the mouse immediately. Your shots and everybody else still come from the confirmed simulation.
- The input lead is measured from the first second (the first pings set the estimate): until now the first seconds of a game could lose inputs to "too late" on a slow line.
- Several level-ups at once now queue properly: a card is picked with a fresh press only (a held key or a repeated input no longer skips the next offer), the next offer opens after a short pause, the clock of a waiting offer starts when it is shown, offers wait while the squad climbs, and the card screen shows "+N" for the offers still waiting.
- Connection: a watchdog reconnects when the server has been silent for 4 seconds; a host who dropped and comes back gets the host role back; a refused rejoin leaves for the menu instead of freezing; the report (settings) logs socket open/close, watchdog and rejoin events.
- Squad cards (bottom left) show each character's live DPS and kills; hover a card for class, level, experience, kills, damage dealt and average DPS, hover a chip for what it is.
- Sound: card offer, freeze, nuke, second wind, weapon pickup, a player falling, arriving on a floor, wall impacts and barrel hits now have sounds (synthesised, CC0); the level-up bell is only for your own level.

## v0.10.0 (2026-10-20)

**Relics, range, aim (rules change: update the server and reload the page)**
- The cards you took sit bottom centre as small icons like relics (same card stacked with a count, a border in the rarity colour). Hover one: it gets a yellow outline and a text opens at the pointer with what it does; it works in the pause menu too.
- Every weapon shoots much further (pistol 14 to 26, AR 18 to 32, shotgun 7 to 16, SMG 10 to 20, sniper 40 to 70, ...; the flamethrower stays short).
- Auto aim never goes without a target while any enemy or barrel is left: it prefers the nearest one it can hit, but when all of them are behind cover it takes the nearest anyway (the bullets then hit the cover); the weapon's range no longer limits the choice, so the shotgun stops dropping its target. Only an empty arena (the floor-cleared countdown) leaves the character free.

## v0.9.1 (2026-10-20)

- Your teammates' hits print their damage too: smaller, in their own colour. Yours stay white (gold when big).

## v0.9.0 (2026-10-20)

**Characters (rules change: update the server and reload the page)**
- Levels are per character now. A kill gives its experience to the character that made it (kills nobody owns are shared by the living); there is no team xp. Every character levels on its own and picks its own three cards when it does; one character's offer never blocks or decides for another, a downed character's offer waits until it is back up. The xp bar and the "Level" in the top panel are yours, each squad card shows its character's level and a dot while it is choosing.
- Upgrades are personal: damage, fire rate, speed, health, piercing, armour, crit, blast, reload, dash, magnet, medic, scholar and the new weapon of the arsenal card all belong to whoever picked them. Only four cards still help everybody (First aid, Full magazines, Grenade crate, Lucky clover): they are marked "Team" and show up on the new info bar.
- Info bar top left: it slides in with the card name, what it did and who took it, stays a few seconds and slides out; more of them wait in a queue.

**Hits and aim**
- Every hit you land prints its damage (pellets of one shot on the same enemy are added into one number).
- Auto aim checks the real bullet path (player to muzzle to target), so a target whose muzzle is behind a wall corner is never picked; the input delay and speeds are smoothed, a leaping enemy is trusted less. 192 test shots with the input arriving 1 and 6 ticks late all land.

**Floors**
- The two floors are never on screen together: the next floor sits far above (a distance worked out from the window shape), the old floor leaves the bottom of the frame whole, the new one comes in whole from the top. The dissolve is gone, the shaft, speed lines and blur stay. The ground around the arena is smaller to make that possible.

**Loading screen**
- Shows the version number.

## v0.8.4 (2026-10-20)

**Menus**
- Three round buttons are always at the top right (menu, lobby, pause, game): language, controls and settings. The language button opens a list; the whole screen is redrawn in the new language and what you typed stays.
- Players joining, picking weapons or the host choosing an arena now update the lobby in place: no new screen, the scroll position, the 3D preview and your clicks stay untouched.

## v0.8.3 (2026-10-20)

**Aim**
- The big orange grenade ring is gone. The enemy (or barrel) the auto aim is locked on gets a round target sign in your own colour; a small ring shows where the grenade will land.
- Shots no longer miss: the aim is worked out from where the muzzle really is (it sits ahead and to the side of the character), leads a walking enemy and allows for the delay of the input; targets hidden behind cover are skipped, the nearest one you can actually shoot is chosen. A new QA test fires 96 auto-aimed shots at walking enemies and demands they land.
- The character turns the instant the aim changes (no wait for the simulation or the network), toward its target, or the way it walks when there is none. The cursor no longer turns the character at all: it only steers the grenades, so you can throw them anywhere without the character spinning.

## v0.8.2 (2026-10-20)

- Settings: "Download report" saves one text file with the game version, settings, page errors and warnings, frame and network history of the last five minutes, stalls with their likely cause and the relay's `/stats`; it replaces the F3/F4 keys (the "Show frame rate and network numbers" switch stays).
- The climb's blur composer is warmed while the menu is up instead of in the first seconds of a game (a half second freeze there).

## v0.8.1 (2026-10-20)

- The flight composer is not warmed on software renderers (it stalled CI browsers); the game smoke test holds the mouse until the simulation has really moved on (slow CI machines ran too few ticks).

## v0.8.0 (2026-10-20)

**Weapons (rules change: update the server and reload the page)**
- A real inventory: every weapon you pick up is yours for the rest of the run, with its own magazine and reserve. Ammo crates refill every weapon you own; a weapon crate you already have refills that weapon. New weapons go into the bag, not into your hands.
- Fixed keys, weakest to strongest: `1`-`9` take the first nine weapons, `Q` takes the next stronger weapon with ammo (and wraps from the strongest to the weakest); the last four weapons are reached with `Q`. A weapon without ammo cannot be selected and never stays in your hands: when it runs dry the nearest weapon by rank takes over.
- The list above the minimap shows the key, an icon, the name and the ammo of every weapon you own; the one in your hands has a yellow outline, empty ones are faded. Icons are rendered with Blender (`tools/blender/make_weapon_icons.py`).
- Weapon drops are about two and a half times as frequent and favour weapons somebody in the squad does not have yet. The arsenal card hands out the next missing weapon.

**Aim**
- Auto aim (on by default, setting "Auto aim"): you only press fire, the shot goes to the nearest enemy or explosive barrel in reach of the weapon (barrels right next to you are left alone). Grenades still fly to the cursor.

**Online**
- Inputs are sent from a worker timer, so a slow, hidden or covered game page no longer starves the others (the likely reason for the host looking frozen to everybody).
- Snapshots for late joiners and resyncs come from the connection with the best round trip time, not from the host if somebody else can do it.
- The settings can show the frame rate and network numbers (rtt, jitter, buffer, stalls) and download a problem report; the relay and the server answer `/stats` (tick lag, messages per second).

**Smoother**
- The climb no longer recompiles every shader when the shaft darkens the sky (one permanent fog), its blur composer is built and warmed at the start of a game, and the next floor is built over two frames.
- Enemies shoved by blasts slide instead of snapping; the automatic resolution scaler changes in smaller steps, waits after a hidden tab or a climb and never changes twice within five seconds.

## v0.7.2 (2026-10-20)

- The floor sounds are balanced against the rest of the mix (countdown ticks, charge, lift and horn were about twice as loud as the other effects).
- CI: the multi-floor lockstep test no longer depends on how quickly the scripted players clear a floor.

## v0.7.1 (2026-10-20)

**Sound**
- Real sounds for the climb between floors (CC0 Kenney packs, built by `tools/audio/make_floor_sfx.py`): clear jingle, countdown ticks, charge swell, lift whoosh, arrival thump and the floor-start horn replace the synthesised stand-ins.

## v0.7.0 (2026-10-20)

**Floors (rules change: update the server and reload the page)**
- Waves are now floors. The next one never starts while an enemy is alive: clear the room and "FLOOR CLEARED" counts down 5 seconds at the top of the screen, then everyone is locked in place, a rune circle charges under the party and the whole squad flies up to the next map, with the camera following through a dark shaft of speed lines, a vertical motion blur and a glowing dissolve between the old floor and the new one. On arrival another 5 second countdown, then the next floor's enemies. The fallen come back at half health; maps follow each other in order.
- Countdown ticks, a charge hum, a lift whoosh, an arrival thump and a floor-start horn.
- `periodSeconds` / `breatherSeconds` are gone from the balance; `floors` holds the new timings.

## v0.6.0 (2026-10-20)

**Speed (rules change: update the server and reload the page)**
- Everyone walks twice as fast (players 6 to 12, every enemy speed doubled), bullets and spit fly twice as fast (ranges unchanged, so a shot lives half as long); the dash is a shorter, sharper burst (x2.4).
- Enemies bounce with every stride, leapers jump in a real arc and a hit pops the body up; running players kick up dust; bullets are drawn between ticks so fast rounds do not jump.

**HUD**
- Player cards in the bottom left: health with its number, a smooth bar, shield overlay, and a chip for every upgrade (damage, fire rate, piercing, ...) plus haste/quad timers. Softer cards, bars and buttons across the HUD.
- Loading overlay with a spinner and progress for joining a game in progress, catching up after the tab was in the background, and reconnecting.

**Network**
- Smooth playout: the simulation steps on an even clock with a buffer sized from the measured jitter (1 to 5 ticks), so bursts of bundles no longer make movement stutter. A large backlog is replayed in 10 ms slices instead of one long freeze.
- A player who stops sending inputs (background tab) stands still after 0.4 s instead of running into a wall; inputs keep their 30 Hz cadence during a hit-stop.

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
