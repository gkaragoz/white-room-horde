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
