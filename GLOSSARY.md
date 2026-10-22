# Simulation

The deterministic core of the game: every client (and the relay's catch-up path) runs the same ticks from the same inputs and must reach the same state.

## Language

**World**:
The complete simulated state of one game at one tick. Everything the next tick depends on lives in it; presentation never feeds back into it.
_Avoid_: game state, state, model

**Snapshot**:
A byte image of a World that can be restored into another World built from the same version, used to recover a desync or to let a late joiner skip the history.
_Avoid_: save, save game, dump

**World hash**:
A single number summarising a World, compared between peers to detect that their simulations have diverged. It covers every simulated value except those declared derived.
_Avoid_: checksum, CRC, state hash

**Checkpoint**:
A World hash taken at a fixed tick interval, stored in a Replay and exchanged on the network.
_Avoid_: sync point, keyframe

**Replay**:
A game's setup plus its confirmed inputs per tick and its Checkpoints, enough to rerun the game and verify it ended the same.
_Avoid_: recording, demo

**WorldSchema**:
The single declaration of every field a World is made of, saying which are carried between ticks and which are derived and therefore left out of the World hash.
_Avoid_: world layout, state definition

## Difficulty

**Multiplier**:
One of the twenty switches that make a game harder in exchange for a higher score, such as Tough Hides or No Medkits.
_Avoid_: mod, modifier, handicap

**Difficulty**:
The set of Multipliers a game is played with, chosen before the game starts and fixed for its whole run; the empty set is the normal game.
_Avoid_: mods, difficulty level, easy/normal/hard

## Progression

**Meta Level**:
The player's level across all runs, raised by experience earned at the end of every run; each new level unlocks a reward bundle.
_Avoid_: account level, player level, rank (the card level inside a run is a different thing)

**Discovery**:
One piece of content the player can unlock and then meet for the first time: a weapon, a drone, a class, a costume, an arena, a power-up, an elite kind, a difficulty multiplier, or a card pack.
_Avoid_: unlock, achievement, collectible

**Discovery Track**:
The fixed, ordered list of Discoveries a player moves along as their Meta Level rises, designed so that every run brings one to three new ones.
_Avoid_: unlock tree, skill tree, battle pass

**Reward Bundle**:
The one to three Discoveries a single Meta Level grants, mixed across categories and always holding at least one that changes play.
_Avoid_: loot box, prize

**Pool**:
The set of Discoveries a game can offer or drop, made of the Core plus what the players in the game have unlocked (in a room, only what every player has unlocked).
_Avoid_: loot table, unlocked set

**Core**:
The content that is never locked: movement, shooting, reload, pistol and a second starting weapon, grenades and barrels, dash, revive, the level-up card offer, health pickups, the basic enemies and the first arena.
_Avoid_: tutorial content, base game

**Codex**:
The player's record of what they have met: a Discovery is entered when it first actually appears in a run, even if it was unlocked earlier.
_Avoid_: collection, bestiary, journal

**Card Pack**:
A themed group of about six to eight cards that unlocks as one Discovery.
_Avoid_: card set, deck

**Experience**:
What a finished run adds to the Meta Level: a tenth of the run's team score, given for every run that lasted at least fifteen seconds.
_Avoid_: points, score (the run score is the number it is made from)

**Reference Run**:
The typical first run, whose median Experience is the unit the Meta Level curve is measured in.
_Avoid_: baseline run, average run

**Pressure**:
How strong the enemies are compared with the full game: below one for new players, rising with the Meta Level until it reaches the full game at level 60.
_Avoid_: difficulty (that is the set of Multipliers the player chooses), scaling

**Signature Achievement**:
The achievement that unlocks a class, tied to what that class is about (grenades for the demolisher, critical hits for the ranger, kills in one run for the berserker, one big hit for the hammerer).
_Avoid_: class quest, class challenge
