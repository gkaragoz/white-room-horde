import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { BALANCE, DRONE_TYPES, MAPS, MAX_PLAYERS, PlayerState, heightAt } from '@wrh/shared';
import { droneStat, type SimEvent, type World } from '@wrh/sim';
import { asset } from '../assets';
import { loadGLB } from './character';

/**
 * The drone companions on screen. The simulation says which drone each player carries and what it is doing (beams, shots,
 * pulses arrive as events); the flying itself is drawn here: each drone chases its owner's *drawn* position with a critically
 * damped spring, floats over the ground it is above (a little ahead of itself along its motion, so it climbs a ramp before
 * it reaches it and never dips into it), leans into its acceleration, turns its anti-gravity halo and bobs.
 */
const MODEL_SCALE = 1.25;
const HOVER = 1.9;
const SPRING = 8;
const SPRING_Z = 7.5;
const BEAMS = 4;
const ZAP_SEGMENTS = 96;
const RINGS = 10;

interface Slot {
  type: number;
  obj: THREE.Group | null;
  rotors: THREE.Object3D[];
  tintMats: THREE.MeshStandardMaterial[];
  beamPoint: THREE.Object3D | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  aimYaw: number;
  aimUntil: number;
  appear: number;
  spin: number;
  beams: THREE.Mesh[];
  field: THREE.Mesh | null;
  ring: THREE.Mesh | null;
  lastTint: string;
  /** QA: the lowest clearance over the ground seen, the fastest climb or fall, the largest jump between frames. */
  dbg: { minClear: number; maxVz: number; maxStep: number; frames: number };
}

interface Bolt {
  born: number;
  segs: number[];
}

interface Pulse {
  born: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  mesh: THREE.Mesh;
  freeze: boolean;
}

const additive = (color: string, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

export class DroneView {
  readonly group = new THREE.Group();
  private readonly models: (THREE.Group | null)[] = DRONE_TYPES.map(() => null);
  private readonly meta: ({ points: Record<string, number[]> } | null)[] = DRONE_TYPES.map(() => null);
  private readonly slots: Slot[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly zapMesh: THREE.InstancedMesh;
  private readonly pulses: Pulse[] = [];
  private readonly ringPool: THREE.Mesh[] = [];
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  loaded = false;

  constructor() {
    this.zapMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), additive('#e2cfff', 0.95), ZAP_SEGMENTS);
    this.zapMesh.frustumCulled = false;
    this.zapMesh.count = 0;
    this.zapMesh.renderOrder = 4;
    this.group.add(this.zapMesh);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), additive('#9fe4ff', 0.6));
      m.visible = false;
      m.renderOrder = 3;
      this.ringPool.push(m);
      this.group.add(m);
    }
    for (let s = 0; s < MAX_PLAYERS; s++) {
      this.slots.push({ type: -1, obj: null, rotors: [], tintMats: [], beamPoint: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimUntil: 0, appear: 0, spin: 0, beams: [], field: null, ring: null, lastTint: '', dbg: { minClear: 1e9, maxVz: 0, maxStep: 0, frames: 0 } });
    }
  }

  async load(): Promise<void> {
    await Promise.all(
      DRONE_TYPES.map(async (id, i) => {
        const gltf = await loadGLB(asset(`models/drones/drone_${id}.glb`));
        const root = gltf.scene;
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = false;
          }
        });
        this.models[i] = root;
        try {
          this.meta[i] = (await (await fetch(asset(`models/drones/drone_${id}.meta.json`))).json()) as { points: Record<string, number[]> };
        } catch {
          this.meta[i] = null;
        }
      }),
    );
    this.loaded = true;
  }

  private build(s: Slot, type: number): void {
    if (s.obj) {
      this.group.remove(s.obj);
      s.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && s.tintMats.includes(m.material as THREE.MeshStandardMaterial)) (m.material as THREE.Material).dispose();
      });
    }
    const src = this.models[type]!;
    const obj = new THREE.Group();
    const inner = SkeletonUtils.clone(src) as THREE.Group;
    inner.scale.setScalar(MODEL_SCALE);
    obj.add(inner);
    s.rotors = [];
    s.tintMats = [];
    s.beamPoint = null;
    inner.traverse((o) => {
      if (o.name === 'halo') s.rotors.push(o);
      if (o.name === 'beam' || (o.name === 'muzzle' && !s.beamPoint)) s.beamPoint = o;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat?.name?.includes('tint')) {
        const own = mat.clone();
        m.material = own;
        s.tintMats.push(own);
      }
    });
    s.obj = obj;
    s.type = type;
    s.appear = 0;
    s.lastTint = '';
    this.group.add(obj);
    for (const b of s.beams) b.visible = false;
    if (s.field) s.field.visible = false;
    if (s.ring) s.ring.visible = false;
  }

  private beam(s: Slot, k: number): THREE.Mesh {
    if (!s.beams[k]) {
      const m = new THREE.Mesh(this.beamGeo, additive('#6dffa8', 0.85));
      m.frustumCulled = false;
      m.renderOrder = 4;
      s.beams[k] = m;
      this.group.add(m);
    }
    return s.beams[k]!;
  }

  /** Per frame. `vx, vy, vz` are where each player is drawn, `lift` the floor climb's extra height. */
  update(w: World, vx: ArrayLike<number>, vy: ArrayLike<number>, vz: ArrayLike<number>, lift: number, now: number, dt: number, colorOf: (slot: number) => string): void {
    if (!this.loaded) return;
    const map = MAPS[w.map] ?? MAPS[0]!;
    const f = BALANCE.drones.follow;
    const d = Math.min(0.05, dt);
    for (let sl = 0; sl < MAX_PLAYERS; sl++) {
      const s = this.slots[sl]!;
      const type = w.pDrone[sl]! - 1;
      const on = w.pActive[sl] === 1 && type >= 0 && w.pState[sl] === PlayerState.Alive;
      if (!on) {
        if (s.obj) s.obj.visible = false;
        for (const b of s.beams) b.visible = false;
        if (s.field) s.field.visible = false;
        if (s.ring) s.ring.visible = false;
        s.appear = 0;
        continue;
      }
      if (s.type !== type || !s.obj) {
        this.build(s, type);
        // a new drone starts at its owner and rises out of it
        s.x = vx[sl]!;
        s.y = vy[sl]!;
        s.z = vz[sl]! + lift;
        s.vx = s.vy = s.vz = 0;
      }
      const obj = s.obj!;
      obj.visible = true;
      const layer = w.pLayer[sl]!;
      // the spot to hover at: beside the owner (the same offset the simulation uses) with a slow drift
      const tx = vx[sl]! - f.side + Math.sin(now * 0.9 + sl * 1.7) * 0.16;
      const ty = vy[sl]! + f.back + Math.cos(now * 0.7 + sl) * 0.12;
      // critically damped spring, in small steps so a long frame cannot overshoot
      const steps = Math.max(1, Math.ceil(d / 0.016));
      const h = d / steps;
      const px0 = s.x;
      const py0 = s.y;
      const pz0 = s.z;
      for (let i = 0; i < steps; i++) {
        s.vx += (SPRING * SPRING * (tx - s.x) - 2 * SPRING * s.vx) * h;
        s.vy += (SPRING * SPRING * (ty - s.y) - 2 * SPRING * s.vy) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
      }
      // height: the ground under the drone and a little ahead of it along its motion (a ramp is climbed before it is reached),
      // never lower than the owner's own floor, then a spring so the climb is smooth
      const ahead = 0.42;
      const g0 = heightAt(map, s.x, s.y, layer);
      const g1 = heightAt(map, s.x + s.vx * ahead, s.y + s.vy * ahead, layer);
      const g2 = heightAt(map, s.x + s.vx * ahead * 2, s.y + s.vy * ahead * 2, layer);
      const floor = Math.max(g0, g1, g2, vz[sl]! - 0.5);
      const tz = floor + HOVER + Math.sin(now * 2.3 + sl * 1.3) * 0.1 + lift;
      for (let i = 0; i < steps; i++) {
        s.vz += (SPRING_Z * SPRING_Z * (tz - s.z) - 2 * SPRING_Z * s.vz) * h;
        s.z += s.vz * h;
      }
      // the numbers the QA script reads
      s.dbg.minClear = Math.min(s.dbg.minClear, s.z - lift - g0);
      s.dbg.maxVz = Math.max(s.dbg.maxVz, Math.abs(s.vz));
      s.dbg.frames++;
      // never into the ground, whatever the spring does
      if (s.z < floor + 0.7 + lift) {
        s.z = floor + 0.7 + lift;
        if (s.vz < 0) s.vz = 0;
      }
      // facing: what it is shooting at for a moment after each shot, else where its owner looks
      const wantYaw = now < s.aimUntil ? s.aimYaw : w.pAngle[sl]!;
      let dy = wantYaw - s.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      s.yaw += dy * Math.min(1, d * 7);
      obj.position.set(s.x, s.z, -s.y);
      obj.rotation.set(0, s.yaw - Math.PI / 2, 0);
      // lean into the acceleration (forward = the model's nose, -Z)
      const fx = Math.cos(s.yaw);
      const fy = Math.sin(s.yaw);
      const fwdSpeed = s.vx * fx + s.vy * fy;
      const sideSpeed = -s.vx * fy + s.vy * fx;
      obj.rotation.x = THREE.MathUtils.clamp(-fwdSpeed * 0.035, -0.28, 0.28);
      obj.rotation.z = THREE.MathUtils.clamp(-sideSpeed * 0.035, -0.28, 0.28);
      s.dbg.maxStep = Math.max(s.dbg.maxStep, Math.hypot(s.x - px0, s.y - py0, s.z - pz0));
      // appearing: the warm-up after a switch or a revive (the drone is there but dim, smaller, and its rotors spin up)
      const warm = w.pDWarm[sl]!;
      const full = BALANCE.drones.warmup;
      const target = warm > 0 ? 0.55 + 0.45 * Math.max(0, 1 - Math.min(warm, full) / full) : 1;
      s.appear += (target - s.appear) * Math.min(1, d * 6);
      obj.scale.setScalar(s.appear);
      s.spin += d * (warm > 0 ? 6 : 2.4); // the halo turns slowly, faster while the drone spins up
      s.rotors.forEach((r) => {
        r.rotation.y = s.spin;
      });
      const tint = colorOf(sl);
      if (tint !== s.lastTint) {
        s.lastTint = tint;
        this.color.set(tint);
        for (const m of s.tintMats) m.color.copy(this.color);
      }
      this.effects(w, sl, s, type, vx, vy, vz, lift, now, map, layer);
    }
    this.updateBolts(now);
    this.updatePulses(now);
  }

  private effects(w: World, sl: number, s: Slot, type: number, vx: ArrayLike<number>, vy: ArrayLike<number>, vz: ArrayLike<number>, lift: number, now: number, map: (typeof MAPS)[number], layer: number): void {
    const level = w.pDLv[sl * DRONE_TYPES.length + type]!;
    const awake = w.pDWarm[sl]! <= 0;
    // healer: a beam to each ally it is healing
    for (let k = 0; k < BEAMS; k++) {
      const t = type === 0 && awake ? w.dBeam[sl * BEAMS + k]! : -1;
      if (t < 0) {
        if (s.beams[k]) s.beams[k]!.visible = false;
        continue;
      }
      const b = this.beam(s, k);
      const from = new THREE.Vector3();
      if (s.beamPoint) s.beamPoint.getWorldPosition(from);
      else from.set(s.x, s.z, -s.y);
      const to = new THREE.Vector3(vx[t]!, vz[t]! + lift + 1.0, -vy[t]!);
      const len = from.distanceTo(to);
      b.position.copy(from);
      b.lookAt(to);
      const pulse = 0.5 + 0.5 * Math.sin(now * 14 + k * 2);
      b.scale.set(0.045 + 0.02 * pulse, 0.045 + 0.02 * pulse, len);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * pulse;
      b.visible = true;
    }
    // cryo: the slowing field on the ground
    if (type === 1) {
      if (!s.field) {
        s.field = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), additive('#7fd6ff', 0.1));
        s.field.renderOrder = 2;
        this.group.add(s.field);
        s.ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 56).rotateX(-Math.PI / 2), additive('#bdeaff', 0.5));
        s.ring.renderOrder = 3;
        this.group.add(s.ring);
      }
      const r = droneStat(1, 'radius', level);
      const gz = heightAt(map, s.x, s.y, layer) + 0.06 + lift;
      s.field.position.set(s.x, gz, -s.y);
      s.field.scale.set(r, 1, r);
      s.field.visible = awake;
      s.ring!.position.set(s.x, gz + 0.01, -s.y);
      s.ring!.scale.set(r, 1, r);
      s.ring!.rotation.y = now * 0.4;
      (s.ring!.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(now * 2.1 + sl);
      s.ring!.visible = awake;
    } else if (type === 6) {
      // collector: a faint brass ring that tells how far it reaches
      if (!s.ring) {
        s.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 56).rotateX(-Math.PI / 2), additive('#ffd27a', 0.22));
        s.ring.renderOrder = 3;
        this.group.add(s.ring);
      }
      const r = droneStat(6, 'radius', level);
      s.ring.position.set(vx[sl]!, heightAt(map, vx[sl]!, vy[sl]!, layer) + 0.05 + lift, -vy[sl]!);
      s.ring.scale.set(r, 1, r);
      s.ring.visible = awake;
    } else {
      if (s.field) s.field.visible = false;
      if (s.ring) s.ring.visible = false;
    }
  }

  private ring(): THREE.Mesh | null {
    return this.ringPool.find((m) => !m.visible) ?? null;
  }

  private updatePulses(now: number): void {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]!;
      const t = (now - p.born) / 0.7;
      if (t >= 1) {
        p.mesh.visible = false;
        this.pulses.splice(i, 1);
        continue;
      }
      const e = 1 - (1 - t) * (1 - t);
      p.mesh.scale.set(p.radius * e, 1, p.radius * e);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = (p.freeze ? 0.85 : 0.5) * (1 - t);
    }
  }

  private updateBolts(now: number): void {
    let n = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      const t = (now - b.born) / 0.22;
      if (t >= 1) {
        this.bolts.splice(i, 1);
        continue;
      }
      const thick = 0.07 * (1 - t) + 0.02;
      for (let k = 0; k + 5 < b.segs.length && n < ZAP_SEGMENTS; k += 6) {
        const a = new THREE.Vector3(b.segs[k]!, b.segs[k + 1]!, b.segs[k + 2]!);
        const c = new THREE.Vector3(b.segs[k + 3]!, b.segs[k + 4]!, b.segs[k + 5]!);
        const len = a.distanceTo(c);
        if (len < 1e-4) continue;
        this.dummy.position.copy(a);
        this.dummy.lookAt(c);
        this.dummy.scale.set(thick, thick, len);
        this.dummy.updateMatrix();
        this.zapMesh.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    this.zapMesh.count = n;
    this.zapMesh.instanceMatrix.needsUpdate = true;
    (this.zapMesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
  }

  /** Where a drone's muzzle is in the world (for flashes), or its centre. */
  muzzleOf(slot: number, which: 'muzzle' | 'muzzle_l' = 'muzzle'): THREE.Vector3 | null {
    const s = this.slots[slot]!;
    if (!s.obj) return null;
    const v = new THREE.Vector3();
    let found = false;
    s.obj.traverse((o) => {
      if (!found && o.name === which) {
        o.getWorldPosition(v);
        found = true;
      }
    });
    if (!found) v.set(s.x, s.z, -s.y);
    return v;
  }

  /** Events of the simulation: the drone turns to what it fires at, lightning is drawn, pulses ring out. */
  onEvent(e: SimEvent, w: World, now: number, lift: number): { x: number; y: number; z: number } | null {
    const map = MAPS[w.map] ?? MAPS[0]!;
    if (e.type === 'droneShot') {
      const s = this.slots[e.slot]!;
      s.aimYaw = e.angle;
      s.aimUntil = now + 0.6;
      return { x: e.x, y: s.z - 0.1, z: e.y };
    }
    if (e.type === 'droneZap') {
      const layer = w.pLayer[e.slot]!;
      const segs: number[] = [];
      const s = this.slots[e.slot]!;
      const pts = e.pts;
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const x0 = k === 0 ? s.x : pts[k]!;
        const y0 = k === 0 ? s.y : pts[k + 1]!;
        const z0 = k === 0 ? s.z : heightAt(map, pts[k]!, pts[k + 1]!, layer) + 0.9 + lift;
        const x1 = pts[k + 2]!;
        const y1 = pts[k + 3]!;
        const z1 = heightAt(map, x1, y1, layer) + 0.9 + lift;
        // a jagged line: three pieces with a sideways kick
        let px = x0;
        let py = y0;
        let pz = z0;
        for (let j = 1; j <= 3; j++) {
          const f = j / 3;
          const kick = j === 3 ? 0 : 0.28;
          const nx = x0 + (x1 - x0) * f + (Math.random() - 0.5) * kick * 2;
          const ny = y0 + (y1 - y0) * f + (Math.random() - 0.5) * kick * 2;
          const nz = z0 + (z1 - z0) * f + (Math.random() - 0.5) * kick;
          segs.push(px, pz, -py, nx, nz, -ny);
          px = nx;
          py = ny;
          pz = nz;
        }
      }
      this.bolts.push({ born: now, segs });
      return null;
    }
    if (e.type === 'dronePulse') {
      const m = this.ring();
      if (m) {
        const layer = w.pLayer[e.slot]!;
        m.position.set(e.x, heightAt(map, e.x, e.y, layer) + 0.1 + lift, -e.y);
        (m.material as THREE.MeshBasicMaterial).color.set(e.freeze ? '#e8fbff' : '#8fdcff');
        m.visible = true;
        this.pulses.push({ born: now, x: e.x, y: e.y, z: 0, radius: e.radius, mesh: m, freeze: e.freeze });
      }
      return null;
    }
    return null;
  }

  /** QA: what the flight of a slot's drone looked like since the last reset. */
  debug(slot: number, reset = false): { minClear: number; maxVz: number; maxStep: number; frames: number; x: number; y: number; z: number } {
    const s = this.slots[slot]!;
    const out = { ...s.dbg, x: s.x, y: s.y, z: s.z };
    if (reset) s.dbg = { minClear: 1e9, maxVz: 0, maxStep: 0, frames: 0 };
    return out;
  }

  /** Where a drone is drawn (world coordinates), for markers and effects of the HUD. */
  positionOf(slot: number): { x: number; y: number; z: number } | null {
    const s = this.slots[slot]!;
    return s.obj && s.obj.visible ? { x: s.x, y: s.y, z: s.z } : null;
  }
}
