import * as THREE from 'three';
import { BALANCE, FloorPhase, MAP_COUNT, MAX_PLAYERS, MISC, PlayerState, TICK_RATE } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { ArenaView } from './arena';
import type { Fx } from './fx';
import { PropsView } from './props';
import { REVEAL, revealOff } from './reveal';
import type { Stage } from './stage';

/** Height between two floors of the climb (world units). */
export const FLOOR_GAP = 18;
/** The dissolve has to reach the edge of the big ground plane. */
const REVEAL_RADIUS = 115;

interface FloorSet {
  arena: ArenaView;
  props: PropsView;
  floor: THREE.Mesh;
}

/** What `FloorClimb.update` tells the render loop. */
export interface ClimbInfo {
  /** The party is between floors (floor rings and the ammo ring are hidden). */
  active: boolean;
  /** Height of the characters and of the camera above the current floor. */
  lift: number;
}

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const easeInOut = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

function runeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineWidth = 13;
  g.beginPath();
  g.arc(0, 0, 118, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 8;
  g.setLineDash([16, 11]);
  g.beginPath();
  g.arc(0, 0, 96, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 9;
  for (let k = 0; k < 3; k++) {
    g.save();
    g.rotate((k * Math.PI * 2) / 3);
    g.beginPath();
    g.moveTo(0, -84);
    g.lineTo(32, 42);
    g.lineTo(-32, 42);
    g.closePath();
    g.stroke();
    g.restore();
  }
  for (let k = 0; k < 12; k++) {
    g.save();
    g.rotate((k * Math.PI * 2) / 12);
    g.fillStyle = '#ffffff';
    g.fillRect(-5, -138, 10, 18);
    g.restore();
  }
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 70);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * The climb to the next floor, drawn from the simulation's floor phase (`world.misc`): while the countdown after a clear
 * runs, the next floor's cover and scenery are built off-screen; during the flight both floors stand one above the other,
 * the camera rises with the party through a darkened shaft of light and speed lines, with a vertical motion blur and a
 * dissolve that eats the old floor while the new one materialises; on arrival the floors swap roles and everything drops
 * back to height zero within one frame (nothing moves on screen).
 */
export class FloorClimb {
  private readonly sets: [FloorSet, FloorSet];
  private cur = 0;
  private flying = false;
  private preparedMap = -1;
  private clearedAt = -1;
  private readonly start = { x: new Array<number>(MAX_PLAYERS).fill(0), y: new Array<number>(MAX_PLAYERS).fill(0) };
  private readonly group = new THREE.Group();
  private readonly runes: THREE.Mesh[] = [];
  private readonly disks: THREE.Mesh[] = [];
  private readonly beam: THREE.Mesh;
  private readonly streaks: THREE.InstancedMesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly streakMat: THREE.MeshBasicMaterial;
  private readonly centre = new THREE.Vector3();
  private lastSpark = 0;
  private readonly dummy = new THREE.Object3D();
  private lampsSwitched = false;
  private lastMap = -1;
  /** Seconds into the flight (for the sound and the tests). */
  flightTime = 0;
  /** 0..1 progress of the lift (after the charge) and of the charge. */
  lift01 = 0;
  charge01 = 0;

  constructor(
    private readonly stage: Stage,
    private readonly fx: Fx,
    arena: ArenaView,
    props: PropsView,
  ) {
    const second: FloorSet = { arena: new ArenaView(), props: props.fork(), floor: stage.floor.clone() };
    this.sets = [{ arena, props, floor: stage.floor }, second];
    for (const o of [second.arena.group, second.props.group, second.floor, this.group]) stage.scene.add(o);
    second.arena.group.visible = second.props.group.visible = second.floor.visible = false;

    const rune = runeTexture();
    for (let i = 0; i < MAX_PLAYERS; i++) {
      for (const pool of [this.runes, this.disks]) {
        // the circle under the feet is a normal (not additive) blue overlay: additive light vanishes on the pale floor
        const floorCircle = pool === this.runes;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rune, color: floorCircle ? '#1b9cff' : '#8fe3ff', transparent: true, opacity: 0, depthWrite: false, blending: floorCircle ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 4;
        this.group.add(m);
        pool.push(m);
      }
    }
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#8fe3ff', alphaMap: beamTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), this.beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 3;
    this.group.add(this.beam);
    this.streakMat = new THREE.MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 7), this.streakMat, 170);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.streaks.renderOrder = 3;
    this.group.add(this.streaks);
  }

  /** Take the second floor and the effects out of the scene again (tests). */
  dispose(): void {
    for (const set of this.sets) {
      this.stage.scene.remove(set.arena.group, set.props.group);
      if (set.floor !== this.stage.floor) this.stage.scene.remove(set.floor);
    }
    this.stage.scene.remove(this.group);
    this.stage.floor.visible = true;
    revealOff();
    this.stage.setDark(0);
    this.stage.setFlightBlur(0);
    this.fx.setFloorFade(1);
  }

  get arena(): ArenaView {
    return this.sets[this.cur]!.arena;
  }

  get props(): PropsView {
    return this.sets[this.cur]!.props;
  }

  private get other(): FloorSet {
    return this.sets[1 - this.cur]!;
  }

  /** The scenery that owns the barrels: the new floor's once the sim has built it, the current one otherwise. */
  get barrelProps(): PropsView {
    return this.flying && this.entered ? this.other.props : this.props;
  }

  private entered = false;

  /** A flight is under way (or its charge-up). */
  get active(): boolean {
    return this.flying;
  }

  /**
   * Build the next floor off-screen at the height of the shaft. The cover boxes and the scenery are built on two different
   * frames (so no single frame carries all of it), and the shaders and textures are warmed with the first build only.
   */
  private prepare(map: number): void {
    if (this.preparedMap === map) return;
    const nx = this.other;
    if (this.building !== map) {
      this.building = map;
      nx.arena.setMap(map);
      nx.arena.group.position.y = nx.props.group.position.y = nx.floor.position.y = FLOOR_GAP;
      return; // the scenery follows on the next frame
    }
    nx.props.setMap(map);
    nx.props.setNight(this.stage.night);
    this.preparedMap = map;
    this.building = -1;
    if (!this.warmed) {
      this.warmed = true;
      // warm the shaders and textures of the new floor once, while the countdown runs
      nx.arena.group.visible = nx.props.group.visible = nx.floor.visible = true;
      const warm = (this.stage.renderer as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<void> }).compileAsync;
      if (warm) void warm.call(this.stage.renderer, this.stage.scene, this.stage.camera).catch(() => undefined);
      nx.arena.group.visible = nx.props.group.visible = nx.floor.visible = false;
    }
  }

  private building = -1;
  private warmed = false;

  private rebase(w: World): void {
    const old = this.sets[this.cur]!;
    this.cur = 1 - this.cur;
    const now = this.sets[this.cur]!;
    now.arena.group.position.y = now.props.group.position.y = now.floor.position.y = 0;
    old.arena.group.visible = old.props.group.visible = old.floor.visible = false;
    old.props.hideBarrels();
    now.arena.group.visible = now.props.group.visible = now.floor.visible = true;
    revealOff();
    this.flying = false;
    this.entered = false;
    this.lampsSwitched = false;
    this.preparedMap = -1;
    this.building = -1;
    this.fx.clearFloor();
    this.fx.setMap(w.map);
    this.lastMap = w.map;
    this.stage.setLamps(now.props.lamps);
    now.props.setNight(this.stage.night);
    this.hideEffects();
    this.stage.setDark(0);
    this.stage.setFlightBlur(0);
    this.lift01 = this.charge01 = this.flightTime = 0;
  }

  private hideEffects(): void {
    for (const m of [...this.runes, ...this.disks]) m.visible = false;
    this.beam.visible = false;
    this.streaks.visible = false;
  }

  /**
   * Called once per frame before the characters are placed. `px`/`py` are the interpolated sim positions of every
   * slot; during the flight they are replaced by where the party really is on screen (still on the old floor until the
   * lift is half over, then gliding to its places on the new one).
   */
  update(w: World, alpha: number, now: number, dt: number, px: number[], py: number[]): ClimbInfo {
    const phase = w.misc[MISC.Phase]!;
    const fl = BALANCE.floors;
    const nextMap = w.wave % MAP_COUNT;
    // whatever happened (a resync, a late join), the floor in play must show the world's map
    if (!this.flying && this.arena.map !== w.map) {
      this.arena.setMap(w.map);
      this.props.setMap(w.map);
      this.stage.setLamps(this.props.lamps);
      this.props.setNight(this.stage.night);
      this.fx.setMap(w.map);
    }
    if (phase === FloorPhase.Cleared) {
      if (this.clearedAt < 0) this.clearedAt = now;
      if (now - this.clearedAt > 0.6) this.prepare(nextMap);
    } else this.clearedAt = -1;

    if (phase !== FloorPhase.Ascend) {
      if (this.flying) this.rebase(w);
      return { active: false, lift: 0 };
    }

    // ---- the flight ----
    const total = fl.ascendSeconds;
    const elapsed = Math.max(0, total - (w.misc[MISC.PhaseEnd]! - w.tick - alpha) / TICK_RATE);
    this.flightTime = elapsed;
    const c = Math.min(1, elapsed / fl.chargeSeconds);
    const p = Math.max(0, Math.min(1, (elapsed - fl.chargeSeconds) / (total - fl.chargeSeconds)));
    this.charge01 = c;
    this.lift01 = p;
    const nx = this.other;
    // a late join or a resync can land here with the next floor not built yet: build it in one go
    if (this.preparedMap !== nextMap) {
      this.prepare(nextMap);
      this.prepare(nextMap);
    }
    if (!this.flying) {
      this.flying = true;
      this.entered = false;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        this.start.x[s] = px[s]!;
        this.start.y[s] = py[s]!;
      }
      this.streaks.visible = true;
      this.beam.visible = true;
      // random speed lines spread over the arena and the whole height of the shaft
      const yaw = new THREE.Euler().setFromQuaternion(this.stage.camera.quaternion, 'YXZ').y;
      for (let i = 0; i < this.streaks.count; i++) {
        this.dummy.position.set((Math.random() - 0.5) * 56, -4 + Math.random() * (FLOOR_GAP + 16), (Math.random() - 0.5) * 36);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.set(0.6 + Math.random() * 1.6, 0.5 + Math.random() * 1.4, 1);
        this.dummy.updateMatrix();
        this.streaks.setMatrixAt(i, this.dummy.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
      this.other.arena.group.visible = this.other.props.group.visible = this.other.floor.visible = false;
    }
    // the new floor is shown once the party starts to rise
    const showNext = p > 0.02;
    nx.arena.group.visible = nx.props.group.visible = nx.floor.visible = showNext;
    // the sim rebuilt the world half way: the barrels now belong to the new floor, the party glides to its new places
    const entered = w.misc[MISC.Entered] === 1;
    if (entered && !this.entered) {
      this.entered = true;
      this.sets[this.cur]!.props.hideBarrels();
    }
    const glide = entered ? smooth((p - 0.5) / 0.5) : 0;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s]) continue;
      const tx = px[s]!;
      const ty = py[s]!;
      px[s] = this.start.x[s]! + (tx - this.start.x[s]!) * glide;
      py[s] = this.start.y[s]! + (ty - this.start.y[s]!) * glide;
      cx += px[s]!;
      cy += py[s]!;
      n++;
    }
    if (n) {
      cx /= n;
      cy /= n;
    }
    const lift = FLOOR_GAP * easeInOut(p);
    this.centre.set(cx, 0, -cy);

    // dissolve of the old floor and materialisation of the new one, both spreading from the party
    REVEAL.split.value = FLOOR_GAP * 0.8;
    REVEAL.old.value.set(cx, 0, -cy, REVEAL_RADIUS * smooth((p - 0.08) / 0.62));
    if (p <= 0.001) REVEAL.old.value.w = -1;
    REVEAL.next.value.set(cx, 0, -cy, REVEAL_RADIUS * smooth((p - 0.3) / 0.7));
    if (p >= 0.995) REVEAL.next.value.w = -1;
    if (p > 0.5 && !this.lampsSwitched) {
      this.lampsSwitched = true;
      this.stage.setLamps(nx.props.lamps.map((l) => ({ ...l, y: l.y + FLOOR_GAP })));
    }

    // ---- effects ----
    const bell = Math.sin(Math.PI * p);
    const spin = now * (1.2 + c * 5);
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const rune = this.runes[s]!;
      const disk = this.disks[s]!;
      const alive = !!w.pActive[s] && w.pState[s] !== PlayerState.Dead;
      rune.visible = disk.visible = alive;
      if (!alive) continue;
      // charge: the circle tightens and brightens under the feet; then it stays behind while a disk rises with the party
      const ringScale = p > 0 ? 4.4 : 7 - 2.6 * (1 - Math.pow(1 - c, 3));
      rune.position.set(px[s]!, 0.05, -py[s]!);
      rune.scale.set(ringScale, ringScale, 1);
      rune.rotation.z = spin;
      (rune.material as THREE.MeshBasicMaterial).opacity = p > 0 ? Math.max(0, 1 - p * 3.5) * 0.95 : 0.25 + 0.75 * c;
      disk.position.set(px[s]!, lift + 0.03, -py[s]!);
      disk.scale.set(2.4, 2.4, 1);
      disk.rotation.z = -spin * 1.3;
      (disk.material as THREE.MeshBasicMaterial).opacity = p > 0 ? 0.35 + 0.5 * bell : 0;
    }
    const spread = 1.7 + (n > 1 ? 1.6 : 0);
    this.beam.position.set(cx, (lift + 9) / 2 - 1, -cy);
    this.beam.scale.set(spread, lift + 11, spread);
    this.beamMat.opacity = Math.min(0.34, c * 0.2 + (p > 0 ? 0.14 + 0.12 * bell : 0));
    this.streakMat.opacity = 0.5 * smooth(p * 6) * smooth((1 - p) * 6);
    // the streaks are fixed in the world, so the rising camera makes them rush past; they sit around the party
    this.streaks.position.set(cx, 0, -cy);

    // sparks and light under the party, a rumble that peaks mid-flight
    if (now - this.lastSpark > 0.045) {
      this.lastSpark = now;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s] || w.pState[s] === PlayerState.Dead) continue;
        this.fx.sparkle(px[s]!, py[s]!, p > 0 ? lift : 0.1, p > 0 ? '#bfeeff' : '#7fdcff', p > 0 ? 1 : 2, p > 0 ? 1.5 : 2.5 + 3 * c);
      }
    }
    this.stage.glow(cx, 1.4 + lift, -cy, '#7fdcff', 5 + 9 * c * (1 - p * 0.5), 0.12, 13);
    this.fx.shake = Math.max(this.fx.shake, 0.06 + 0.16 * c * (1 - p) + 0.22 * bell);
    this.fx.setFloorFade(1 - smooth((p - 0.04) / 0.5));
    this.stage.setDark(0.82 * Math.pow(bell, 0.7));
    this.stage.setFlightBlur(0.026 * Math.pow(bell, 1.2));
    void dt;
    return { active: true, lift };
  }
}
