import { MAX_LEVEL } from '@wrh/shared';
import { FlowField } from './flowfield';
import { applyObstacles } from './obstacles';
import { Rng } from './rng';
import { createFields, type SchemaArrays, type SchemaScalars } from './schema';
import { SpatialHash } from './spatial';

/** Events emitted by a step for the client (VFX, audio). They never feed back into the simulation. */
export type SimEvent =
  | { type: 'shot'; slot: number; weapon: number; x: number; y: number; angle: number }
  /** reason: 0 range ended, 1 hit cover, 2 hit an enemy */
  | { type: 'bulletGone'; x: number; y: number; angle: number; reason: number }
  | { type: 'enemyHit'; id: number; etype: number; x: number; y: number; damage: number; by: number }
  | { type: 'enemyDeath'; id: number; etype: number; x: number; y: number; dx: number; dy: number; power: number }
  | { type: 'playerHit'; slot: number; x: number; y: number; damage: number }
  | { type: 'weaponSwitch'; slot: number; weapon: number }
  | { type: 'weaponGet'; slot: number; weapon: number; fresh: boolean }
  | { type: 'secondWind'; slot: number }
  | { type: 'barrelHit'; x: number; y: number }
  | { type: 'nuke'; x: number; y: number }
  | { type: 'freeze'; seconds: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'grenadeThrown'; owner: number; x: number; y: number }
  | { type: 'spit'; x: number; y: number; angle: number }
  | { type: 'pickupDrop'; kind: number; x: number; y: number }
  | { type: 'pickup'; kind: number; slot: number; x: number; y: number }
  | { type: 'reloadStart'; slot: number }
  | { type: 'reloadDone'; slot: number }
  | { type: 'dash'; slot: number; x: number; y: number }
  | { type: 'bossAbility'; kind: 'charge' | 'summon' | 'aura' | 'slam' | 'meteor' | 'acid' | 'sweep' | 'purge' | 'quake' | 'storm' | 'plague' | 'pounce' | 'hurl'; x: number; y: number }
  | { type: 'playerDown'; slot: number; x: number; y: number }
  | { type: 'playerDead'; slot: number }
  | { type: 'playerRevive'; slot: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'floorAscend'; from: number; to: number; map: number }
  | { type: 'floorEnter'; wave: number; map: number }
  | { type: 'floorArrive'; wave: number }
  | { type: 'waveStart'; wave: number; boss: boolean; mod: number }
  | { type: 'levelUp'; slot: number; level: number }
  | { type: 'cardOffer'; slot: number; cards: number[] }
  | { type: 'cardPicked'; card: number; by: number }
  | { type: 'thaw' }
  | { type: 'blink'; id: number; x0: number; y0: number; x: number; y: number }
  /** A newer enemy starts winding up a big move / starts the move itself (etype indexes ENEMY_TYPES). */
  | { type: 'windup'; id: number; etype: number; x: number; y: number }
  | { type: 'enemyAct'; id: number; etype: number; x: number; y: number }
  /** The last enemy of a floor fell: `by` is the character who landed the blow (-1 none). The floor-clear countdown starts after the finisher. */
  | { type: 'finalKill'; by: number; x: number; y: number }
  /** A telegraphed attack starts charging (shape and effect: see TeleShape, TeleEffect) / lands. */
  | { type: 'telegraph'; shape: number; x: number; y: number }
  | { type: 'teleHit'; shape: number; effect: number; x: number; y: number; radius: number }
  | { type: 'launch'; slot: number; x: number; y: number }
  /** A class ability was used (cls = index into CLASS_IDS). */
  | { type: 'ability'; slot: number; cls: number; x: number; y: number }
  /** A melee swing: an arc (or the whole circle) of `radius` around the player facing `angle`; `charge` 0..1 for a charged hammer. */
  | { type: 'swing'; slot: number; weapon: number; x: number; y: number; angle: number; arc: number; radius: number; hits: number; charge: number }
  /** A drone fired (kind = DRONE_TYPES index): bullets and rockets leave from (x, y); the healer beam and the cryo field are read from the world. */
  | { type: 'droneShot'; slot: number; kind: number; x: number; y: number; angle: number }
  /** A tesla drone's chain: x0, y0, x1, y1, ... of the drone and the enemies it jumped to. */
  | { type: 'droneZap'; slot: number; pts: number[] }
  /** A cryo drone's pulse (the one that freezes for a moment when `freeze`). */
  | { type: 'dronePulse'; slot: number; x: number; y: number; radius: number; freeze: boolean }
  | { type: 'droneLevel'; slot: number; kind: number; level: number }
  /** A drone joined the inventory (`fresh`) or a duplicate turned into experience. */
  | { type: 'droneUnlock'; slot: number; kind: number; fresh: boolean }
  | { type: 'droneSwap'; slot: number; kind: number }
  | { type: 'gameOver'; wave: number; kills: number };

/**
 * The simulated state (docs/DESIGN.md section 15) plus the members that are not part of it. Every number and typed
 * array comes from the WorldSchema (schema.ts), which is also where each field is documented.
 */
export interface World extends SchemaScalars, SchemaArrays {
  rng: Rng;
  /** Events of the tick being stepped, for the client (VFX, audio). Never read back by the simulation. */
  events: SimEvent[];
  // derived data, rebuilt from the fields above (its arrays are in the schema as snapshotted, never hashed)
  field: FlowField;
  /** The same for the deck layer (only used on maps with decks). */
  field1: FlowField;
  grid: SpatialHash;
}

export function createWorld(seed: number, map = 0, mods = 0, level = MAX_LEVEL): World {
  const w = createFields({ map, mods, level }) as World;
  w.rng = new Rng(seed);
  w.events = [];
  w.field = new FlowField();
  w.field1 = new FlowField();
  w.grid = new SpatialHash();
  applyObstacles(w.field, map, 0);
  applyObstacles(w.field1, map, 1);
  return w;
}
