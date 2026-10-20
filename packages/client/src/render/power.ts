import * as THREE from 'three';
import { BALANCE, MAX_PLAYERS, PlayerState } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** One upgrade the player can see on their character: colour of its gem and how strong it is (0 = not taken). */
export interface PowerKind {
  id: string;
  color: string;
  level(w: World, s: number): number;
}

/** The visible upgrade categories. The levels are read from the simulation's modifiers, so nothing here touches the sim. */
export const POWERS: readonly PowerKind[] = [
  { id: 'damage', color: '#ff4d4d', level: (w, s) => w.modDamage[s]! * w.pModDmg[s]! - 1 },
  { id: 'rate', color: '#ff9f2e', level: (w, s) => w.modRate[s]! * w.pModRate[s]! - 1 },
  { id: 'pierce', color: '#35d6ff', level: (w, s) => (w.modPierce[s]! + w.pModPierce[s]!) * 0.5 },
  { id: 'crit', color: '#ffd21f', level: (w, s) => w.modCrit[s]! * 3 },
  { id: 'blast', color: '#ff6a1a', level: (w, s) => w.modBlast[s]! - 1 },
  { id: 'speed', color: '#b6ff3d', level: (w, s) => w.modSpeed[s]! * w.pModSpeed[s]! - 1 },
  { id: 'hp', color: '#ff6fa5', level: (w, s) => (w.pMaxHp[s]! - BALANCE.player.hp) / BALANCE.player.hp },
  { id: 'armor', color: '#7aa7ff', level: (w, s) => 1 - w.modArmor[s]! * w.pModArmor[s]! },
  { id: 'magnet', color: '#b36bff', level: (w, s) => w.modMagnet[s]! - 1 },
  { id: 'luck', color: '#5df08a', level: (w) => w.modLoot - 1 },
  { id: 'scholar', color: '#5aa0ff', level: (w, s) => w.modXp[s]! - 1 },
  { id: 'medic', color: '#3df2c8', level: (w, s) => 1 - w.modRevive[s]! },
  { id: 'quick', color: '#ffffff', level: (w, s) => 1 - w.modReload[s]! },
  { id: 'roll', color: '#2fd0b0', level: (w, s) => 1 - w.modDash[s]! },
  { id: 'vampire', color: '#c8102e', level: (w, s) => w.pLifesteal[s]! * 0.5 },
];

const KIND = Object.fromEntries(POWERS.map((p, i) => [p.id, i])) as Record<string, number>;
const MAX_GEMS = MAX_PLAYERS * POWERS.length;

/** Levels of the combat upgrades of one player, used by tracers and muzzle flashes. */
export interface Strength {
  damage: number;
  rate: number;
  pierce: number;
  crit: number;
}

export function strengthOf(w: World, s: number): Strength {
  return {
    damage: Math.max(0, POWERS[KIND.damage!]!.level(w, s)),
    rate: Math.max(0, POWERS[KIND.rate!]!.level(w, s)),
    pierce: Math.max(0, POWERS[KIND.pierce!]!.level(w, s)),
    crit: Math.max(0, POWERS[KIND.crit!]!.level(w, s)),
  };
}

/**
 * What your upgrades look like: a little gem per upgrade orbiting each character, a shield bubble for armour, the pull
 * radius of the magnet on the floor and drifting sparkles for the soft upgrades. Purely cosmetic.
 */
export class PowerView {
  readonly group = new THREE.Group();
  private readonly gems: THREE.InstancedMesh;
  private readonly shields: THREE.Mesh[] = [];
  private readonly magnet: THREE.Mesh;
  private gemCount = 0;
  private readonly tmp = new THREE.Object3D();
  private readonly col = new THREE.Color();
  private readonly acc = new Float64Array(MAX_PLAYERS * 2);

  constructor(private readonly sparkle: (x: number, y: number, h: number, color: string, count: number, speed: number) => void) {
    this.gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_GEMS);
    this.gems.frustumCulled = false;
    this.gems.count = 0;
    this.group.add(this.gems);
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.85, 2.0, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: '#7aa7ff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      m.visible = false;
      m.renderOrder = 6;
      this.shields.push(m);
      this.group.add(m);
    }
    this.magnet = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: '#b36bff', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
    this.magnet.rotation.x = -Math.PI / 2;
    this.magnet.position.y = 0.03;
    this.magnet.visible = false;
    this.group.add(this.magnet);
  }

  begin(): void {
    this.gemCount = 0;
    this.magnet.visible = false;
  }

  /** Draw the upgrades of player `s` standing at sim position (x, y). */
  slot(w: World, s: number, x: number, y: number, now: number, dt: number, isLocal: boolean, lift = 0): void {
    const shield = this.shields[s]!;
    if (!w.pActive[s] || w.pState[s] === PlayerState.Dead) {
      shield.visible = false;
      return;
    }
    const down = w.pState[s] === PlayerState.Downed;
    const active: { p: PowerKind; level: number }[] = [];
    for (const p of POWERS) {
      const level = p.level(w, s);
      if (level > 0.005) active.push({ p, level });
    }
    // gems orbit at hip height; more upgrades widen the ring slightly
    const n = active.length;
    for (let k = 0; k < n && !down; k++) {
      const a = now * 1.6 + (k / n) * Math.PI * 2;
      const r = 0.78 + Math.min(0.2, n * 0.012);
      const size = 0.06 + Math.min(0.06, active[k]!.level * 0.05);
      this.tmp.position.set(x + Math.cos(a) * r, 1.05 + lift + Math.sin(now * 2.2 + k) * 0.08, -y + Math.sin(a) * r);
      this.tmp.rotation.set(now * 2 + k, now * 1.3, 0);
      this.tmp.scale.setScalar(size);
      this.tmp.updateMatrix();
      this.gems.setMatrixAt(this.gemCount, this.tmp.matrix);
      this.gems.setColorAt(this.gemCount, this.col.set(active[k]!.p.color));
      this.gemCount++;
    }
    // armour: a faint bubble that gets stronger with every plate
    const armor = Math.max(0, POWERS[KIND.armor!]!.level(w, s));
    shield.visible = armor > 0.01 && !down;
    if (shield.visible) {
      shield.position.set(x, 1.0 + lift, -y);
      shield.rotation.y = now * 0.8;
      (shield.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.min(0.3, armor * 0.9) + Math.sin(now * 3) * 0.02;
    }
    // soft upgrades leave drifting sparkles
    if (!down) {
      this.acc[s * 2] = this.acc[s * 2]! + dt;
      if (this.acc[s * 2]! > 0.35 && active.length) {
        this.acc[s * 2] = 0;
        const soft = active.filter((a) => ['luck', 'scholar', 'medic', 'vampire', 'crit', 'magnet'].includes(a.p.id));
        if (soft.length) {
          const pick = soft[Math.floor(Math.random() * soft.length)]!;
          this.sparkle(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, 0.4 + lift, pick.p.color, 1, 1.2);
        }
      }
      // speed: dust streaks while running fast
      this.acc[s * 2 + 1] = this.acc[s * 2 + 1]! + dt;
      const sp = POWERS[KIND.speed!]!.level(w, s);
      if (sp > 0.12 && w.pMoving[s] === 1 && this.acc[s * 2 + 1]! > 0.09) {
        this.acc[s * 2 + 1] = 0;
        this.sparkle(x, y, 0.15, '#e8f5c8', 1, 0.8);
      }
    }
    if (isLocal) {
      const mg = POWERS[KIND.magnet!]!.level(w, s);
      this.magnet.visible = mg > 0.01 && !down && lift < 0.2;
      if (this.magnet.visible) {
        const r = BALANCE.pickups.magnetRadius * w.modMagnet[s]!;
        this.magnet.position.x = x;
        this.magnet.position.z = -y;
        this.magnet.scale.setScalar(r);
        (this.magnet.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(now * 2.4));
      }
    }
  }

  end(): void {
    this.gems.count = this.gemCount;
    this.gems.instanceMatrix.needsUpdate = true;
    if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
  }

  /** Extra size of a character for health upgrades (up to +12%). */
  static bodyScale(w: World, s: number): number {
    return 1 + Math.min(0.12, Math.max(0, POWERS[KIND.hp!]!.level(w, s)) * 0.3);
  }
}
