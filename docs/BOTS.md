# Companion bots

Bots are teammates that play the game through the same `PlayerInput` a person does. They fill the squad when friends are not around
and are the benchmark opponent for balance work. There is no cheating channel: a bot sees the world the simulation sees and answers
with buttons and sticks, so a game with bots is an ordinary lockstep game and replays exactly.

## Where things live

| Part | Where |
| --- | --- |
| The brain (perception, movement, combat, build, team) | `packages/bot/src` |
| Public API (all the rest of the game may use) | `packages/bot/src/index.ts`: `Squad`, `botLoadouts`, `SKILLS`, `BOT_NAMES` |
| Player rules (how many, skill, classes, XP) | `packages/client/src/companions.ts` |
| Menu (Play page picker, room picker, bot rows) | `packages/client/src/screens.ts`, `menu.ts` |
| Solo and online driving | `packages/client/src/main.ts` (`startSolo`, `driveRoomBots`) |
| Relay: bots as room members | `packages/net/src/room.ts`, `protocol.ts`, `client.ts` |

## API

```ts
import { Squad, botLoadouts, SKILLS, BOT_NAMES } from '@wrh/bot';

// who plays: classes (respecting what the room's level opens) and a name per bot
const loads = botLoadouts(freeSlots, count, seed, allowedClassIndices, classesThePeoplePlay);
// the squad: one Bot per slot; `humans` are the slots people drive (bots treat them as allies to protect and revive)
const squad = new Squad(loads.map((l) => l.slot), 'expert', seed, new Set([0]));
// once per tick, with the world as it is before `step`: slot -> PlayerInput (only active slots)
const inputs = squad.inputs(world);
```

The same seed and world always give the same inputs (a bot has its own random stream, never the world's). Feed the inputs to the
tick exactly where the person's own input goes.

## Skill levels

`easy`, `normal`, `expert` (default), `superhuman`. The skill only degrades what the modules try to do: reaction delay in ticks,
aim error, how often the bot decides again, how well it dodges and picks (see `packages/bot/src/skill.ts`).

## In the game

- **Solo.** Play page, Companions 0 to 7 and the skill (remembered). `?bots=N` (up to 10) and `?botskill=easy|normal|expert|superhuman`
  override the menu for a dev game and start without the menu. The bots' inputs join the player's in the tick loop of `main.ts`.
- **Online.** The host sets Companions in the room (the limit is the free slots, at most 7). The host's page runs the brains and
  sends their inputs; nobody else runs bots and the relay never runs one. Bots appear in every list marked with a robot badge.
- **Experience.** A run with companions earns `round(teamScore / 10) / (1 + 0.25 * companions)`. The game over screen says so.
  Achievements stay per human slot and unchanged; the room's meta level, pool and pressure do not depend on bots.
- **Classes and guns.** Bots take classes the room's level opens (plus the achievement classes of the host), avoiding classes the
  people already play while there are others. A gun the pool has not opened is swapped for the SMG.

## Online protocol

A bot is a room member without a connection (`Member.bot`). Messages:

- `{ t: 'bots', list: [[class, weapon, name], ...], skill }` host only, lobby only: replaces all bots, they take the lowest free
  slots, as many as fit. Everything is sanitized (class and weapon in range, name stripped and cut to 16). The `room` message
  carries `botSkill`, and every bot is a `PlayerInfo` with `bot: true` and `connected: true`.
- Binary `Bin.BotInputs` (6): `[6][tick u32][n u8]` then n times `[slot u8][input]`. Same "tagged by target tick" semantics as the
  host's own input and the same window. The relay accepts it only from the current host and only for slots that hold a bot; the
  input goes through the same cleaning as a person's (`clampInput`, no Away flag). Rate limit: the connection's normal budget.
- A person joining a full lobby takes the place of the last bot.

**When the host's page is gone.** The bots stop being driven: after 12 ticks without input they stand still with the Away flag, the
same protection a dropped player has (`awayProtectSeconds`). They stay in the room and in every bundle for the whole game; they are
never "disconnected" and never count in hash votes or as snapshot donors. The host role passes to the next connected person
(as before), and *that* page starts driving the bots at once: the squad is deterministic from the room's seed and the world, so any page
can take over (the brain's short term memory restarts, nothing else). When the old host rejoins it gets the role, and the bots, back.
If nobody is connected the room idles and is deleted like any other. Late joiners and returning players get the bots through the
ordinary start message, history and snapshots: a bot is a player like any other to them.

Relay deploy: the relay protocol changed (new client message, new binary type, `bot` flag, `botSkill`), so this needs a minor version
bump and a relay redeploy before clients with bots can host online.

## Benchmarks

- Strength: `MEASURE=1 pnpm --filter @wrh/bot exec vitest run tests/bench.test.ts` (see the file for the knobs: `BOTS`, `SKILLS`,
  `RUNS`, `MAPS`). Compare runs on the same seeds.
- Cost: `pnpm --filter @wrh/client exec vitest run tests/companions.test.ts` prints the brains' milliseconds per tick for ten bots in a
  real world. In the browser the HUD fps line (`?perf=1` or Settings, show fps) adds `bots x.xx ms`, and `window.__wrh.perf.botMs`
  holds it for scripts.
- Page checks: `node tools/ci/bot-smoke.mjs` boots a solo game with three bots (dev address and menu picker) and checks that they move.
