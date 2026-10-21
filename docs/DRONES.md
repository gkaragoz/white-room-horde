# Drone companions

A player carries **one active drone** and keeps the others in an inventory. Drones are won from the new `drone` level-up
card (rare) and from **drone cores** (elites drop one now and then, bosses nearly always, and the end of floor 2 gives every
player one). A new drone joins the inventory; with all seven owned a card or core turns into experience for the active one.
The inventory is the drone card in the top left of the HUD: a click opens the list, a click on a drone switches to it (the new
drone warms up for 4 s). Drones cannot be destroyed. If the owner is down or dead the drone is off and wakes a second after the
revive; through the climb to the next floor it follows without firing. Levels (to 30) are earned only by the active drone and
last for the run; every 5 levels is a power tier.

| Type | What it does | Experience from |
|---|---|---|
| healer | green beam to the squad members who need it most (more targets with the tiers); revives a downed player from tier 4 | health given |
| cryo | a slowing field around it (bosses half, never frozen), damage and a freezing pulse on higher tiers | enemies slowed |
| rocket | salvo of rockets that burst on the crowd | damage, kills |
| gun | long range, accurate machine gun | damage, kills |
| twin | close range spray, more barrels on higher tiers | damage, kills |
| tesla | lightning that jumps from enemy to enemy | damage, kills |
| collector | pulls the loot its owner wants from far away | pickups |

All numbers are in `packages/shared/data/balance.json` under `drones` (arrays by power tier). A drone's damage uses its owner's
damage and crit cards (not fire rate or piercing) and is credited to the owner. The sim is `packages/sim/src/drones.ts`; the
drawing, with a spring that follows the owner and keeps the drone above ramps, is `packages/client/src/render/drones.ts`.
Models: `tools/blender/make_drones.py`. Sounds: `tools/audio/make_drone_sfx.py` (recordings, CC0).
