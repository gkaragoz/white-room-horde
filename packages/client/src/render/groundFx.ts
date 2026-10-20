import * as THREE from 'three';
import { BALANCE, ENEMY_TYPES, MAX_ENEMIES, MAX_PLAYERS, MAX_TELE, MAX_ZONES, WEAPON_IDS, TeleEffect, TeleShape, ZoneKind } from '@wrh/shared';
import type { World } from '@wrh/sim';
import type { Fx } from './fx';

const DANGER = { friendly: '#3fd0ff', hurt: '#ff4a3a', deadly: '#c4006e', acid: '#8fd13a', safeHurt: '#ffb000', safeDeadly: '#2f7bff' };

function blotchTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, a);
  grad.addColorStop(0.7, a);
  grad.addColorStop(1, b);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  // blotches so a puddle is not a perfect disc
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
    g.beginPath();
    g.arc(30 + Math.random() * 68, 30 + Math.random() * 68, 3 + Math.random() * 10, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 12;
  for (let k = -64; k < 128; k += 32) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface TeleView {
  group: THREE.Group;
  fill: THREE.Mesh;
  ring: THREE.Mesh;
  bars: THREE.Mesh[];
  fillMat: THREE.MeshBasicMaterial;
  lineMat: THREE.MeshBasicMaterial;
}

/**
 * The ground effects of the simulation, drawn from its pools every frame: telegraphed attacks (an outline of the area, a
 * hatched fill that spreads over it until the blow lands) and the lingering acid and fire. The outline and the hatching mean
 * the same in every colour setting; "colour-blind" swaps red and green for amber and blue.
 */
export class GroundFx {
  readonly group = new THREE.Group();
  private readonly tele: TeleView[] = [];
  private readonly zones: THREE.Mesh[] = [];
  private readonly acidTex = blotchTexture('rgba(143,209,58,0.85)', 'rgba(143,209,58,0.0)');
  private readonly fireTex = blotchTexture('rgba(255,120,30,0.85)', 'rgba(255,60,0,0.0)');
  private readonly stripes = stripeTexture();
  private readonly fillGeoCircle = new THREE.CircleGeometry(1, 56);
  private readonly ringGeo = new THREE.RingGeometry(0.955, 1, 64);
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private bubbleT = 0;
  colorblind = false;
  /** Charge bars over the heads of enemies that are winding up a big move. */
  private readonly bars: { back: THREE.Mesh; fill: THREE.Mesh }[] = [];
  private readonly barBack = new THREE.MeshBasicMaterial({ color: '#10141c', transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, toneMapped: false });
  private readonly barFill = new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false });

  /** The charge bar over a character who is charging a swing (only while charging). */
  private readonly pBars: { back: THREE.Mesh; fill: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private readonly right = new THREE.Vector3();

  constructor() {
    this.group.renderOrder = 3;
    for (let k = 0; k < MAX_PLAYERS; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.97, depthTest: false, depthWrite: false, toneMapped: false });
      const back = new THREE.Mesh(this.quad, this.barBack);
      const fill = new THREE.Mesh(this.quad, mat);
      back.renderOrder = 31;
      fill.renderOrder = 32;
      back.visible = fill.visible = false;
      this.group.add(back, fill);
      this.pBars.push({ back, fill, mat });
    }
    for (let i = 0; i < MAX_TELE; i++) {
      const fillMat = new THREE.MeshBasicMaterial({ color: '#ff4a3a', map: this.stripes, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false, side: THREE.DoubleSide });
      const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false, side: THREE.DoubleSide });
      const group = new THREE.Group();
      const fill = new THREE.Mesh(this.fillGeoCircle, fillMat);
      const ring = new THREE.Mesh(this.ringGeo, lineMat);
      for (const m of [fill, ring]) {
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 3;
      }
      const bars: THREE.Mesh[] = [];
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(this.quad, lineMat);
        b.rotation.x = -Math.PI / 2;
        b.renderOrder = 3;
        bars.push(b);
        group.add(b);
      }
      group.add(fill, ring);
      group.visible = false;
      this.group.add(group);
      this.tele.push({ group, fill, ring, bars, fillMat, lineMat });
    }
    for (let k = 0; k < 40; k++) {
      const back = new THREE.Mesh(this.quad, this.barBack);
      const fill = new THREE.Mesh(this.quad, this.barFill);
      back.renderOrder = fill.renderOrder = 30;
      back.visible = fill.visible = false;
      this.group.add(back, fill);
      this.bars.push({ back, fill });
    }
    for (let i = 0; i < MAX_ZONES; i++) {
      const m = new THREE.Mesh(this.fillGeoCircle, new THREE.MeshBasicMaterial({ map: this.acidTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      this.group.add(m);
      this.zones.push(m);
    }
  }

  /** Charge bars over winding-up enemies; they face the camera. */
  updateBars(w: World, camQuat: THREE.Quaternion, nowSec: number): void {
    let n = 0;
    this.right.set(1, 0, 0).applyQuaternion(camQuat);
    for (let i = 0; i < MAX_ENEMIES && n < this.bars.length; i++) {
      if (!w.eActive[i] || w.eAct[i] !== 1 || w.eAux[i]! <= 0) continue;
      const p = Math.max(0, Math.min(1, 1 - w.eActT[i]! / w.eAux[i]!));
      const r = BALANCE.enemies[ENEMY_TYPES[w.eType[i]!]!].radius;
      const b = this.bars[n++]!;
      const width = 2.1 + r * 0.9;
      const y = 1.6 + r * 1.7;
      for (const m of [b.back, b.fill]) {
        m.visible = true;
        m.quaternion.copy(camQuat);
      }
      b.back.position.set(w.eX[i]!, y, -w.eY[i]!);
      b.back.scale.set(width + 0.16, 0.42, 1);
      // the fill grows from the left edge of the bar (in screen space)
      const right = this.right;
      b.fill.position.set(w.eX[i]! + right.x * (-width / 2 + (width * p) / 2), y + right.y * (-width / 2 + (width * p) / 2), -w.eY[i]! + right.z * (-width / 2 + (width * p) / 2));
      b.fill.scale.set(Math.max(0.001, width * p), 0.28, 1);
    }
    this.barFill.color.set(this.colorblind ? '#2f7bff' : n > 0 && Math.sin(nowSec * 18) > 0.4 ? '#ff5a3c' : '#ffb000');
    for (let k = n; k < this.bars.length; k++) this.bars[k]!.back.visible = this.bars[k]!.fill.visible = false;
  }

  /** Charge bars over the characters who are charging a swing: they fill, and flash white when full. */
  updatePlayerBars(w: World, camQuat: THREE.Quaternion, nowSec: number, px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>, lift: number): void {
    this.right.set(1, 0, 0).applyQuaternion(camQuat);
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const b = this.pBars[s]!;
      const charge = w.pActive[s] ? w.pCharge[s]! : 0;
      const m = charge > 0 ? BALANCE.weapons[WEAPON_IDS[w.pWeapon[s]!]!]?.melee?.charge ?? 0 : 0;
      if (m <= 0 || charge <= 0.05) {
        b.back.visible = b.fill.visible = false;
        continue;
      }
      const p = Math.max(0, Math.min(1, charge / m));
      const width = 2.4;
      const y = 3.0 + lift + pz[s]!;
      b.back.visible = b.fill.visible = true;
      b.back.quaternion.copy(camQuat);
      b.fill.quaternion.copy(camQuat);
      b.back.position.set(px[s]!, y, -py[s]!);
      b.back.scale.set(width + 0.16, 0.42, 1);
      const off = -width / 2 + (width * p) / 2;
      b.fill.position.set(px[s]! + this.right.x * off, y + this.right.y * off, -py[s]! + this.right.z * off);
      b.fill.scale.set(Math.max(0.001, width * p), 0.28, 1);
      const full = p >= 0.999;
      b.mat.color.set(this.colorblind ? '#2f7bff' : full ? (Math.sin(nowSec * 30) > 0 ? '#ffffff' : '#ffe27a') : '#7fd8ff');
    }
  }

  /** Sync with the world (call once per frame, `lift` is the height of the floor during the climb). */
  update(w: World, nowSec: number, fx: Fx | null, dt: number): void {
    this.bubbleT += dt;
    const bubble = this.bubbleT > 0.18;
    if (bubble) this.bubbleT = 0;
    for (let i = 0; i < MAX_ZONES; i++) {
      const m = this.zones[i]!;
      if (!w.zActive[i]) {
        m.visible = false;
        continue;
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      const fire = w.zKind[i] === ZoneKind.Fire;
      mat.map = fire ? this.fireTex : this.acidTex;
      const left = w.zLeft[i]! / 30;
      const wob = 1 + Math.sin(nowSec * 3 + i) * 0.03;
      m.visible = true;
      m.position.set(w.zX[i]!, 0.045, -w.zY[i]!);
      m.scale.setScalar(w.zR[i]! * wob);
      mat.opacity = Math.min(1, left * 1.2) * (fire ? 0.85 + Math.sin(nowSec * 14 + i) * 0.12 : 0.8);
      if (bubble && fx && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * w.zR[i]! * 0.8;
        fx.sparkle(w.zX[i]! + Math.cos(a) * r, w.zY[i]! + Math.sin(a) * r, 0.1, fire ? '#ffb24a' : '#c9ff7a', 1, fire ? 2.4 : 0.8);
      }
    }
    for (let i = 0; i < MAX_TELE; i++) {
      const v = this.tele[i]!;
      if (!w.tActive[i]) {
        v.group.visible = false;
        continue;
      }
      v.group.visible = true;
      const total = Math.max(1, w.tTotal[i]!);
      const p = 1 - w.tLeft[i]! / total;
      const effect = w.tEffect[i]!;
      const deadly = effect === TeleEffect.Half || effect === TeleEffect.Kill;
      const acid = effect === TeleEffect.Acid;
      const friendly = effect === TeleEffect.Strike;
      const col = friendly ? DANGER.friendly : acid ? DANGER.acid : deadly ? (this.colorblind ? DANGER.safeDeadly : DANGER.deadly) : this.colorblind ? DANGER.safeHurt : DANGER.hurt;
      v.fillMat.color.set(col);
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * (6 + p * 14));
      v.fillMat.opacity = 0.28 + 0.3 * p + pulse * 0.08 * p;
      v.lineMat.color.set(p > 0.8 && pulse > 0.5 ? '#ffffff' : col);
      v.lineMat.opacity = 0.75 + 0.25 * pulse;
      const x = w.tX[i]!;
      const z = -w.tY[i]!;
      if (w.tShape[i] === TeleShape.Circle) {
        const r = w.tW[i]!;
        v.group.position.set(x, 0.06, z);
        v.group.rotation.y = 0;
        // the fill spreads from the middle until it reaches the edge at the moment of the blow
        v.fill.visible = true;
        v.fill.scale.setScalar(Math.max(0.001, r * (0.12 + 0.88 * p)));
        v.fill.position.set(0, 0, 0);
        v.ring.visible = true;
        v.ring.scale.setScalar(r);
        v.fillMat.map!.repeat.set(Math.max(1, r / 3), Math.max(1, r / 3));
        for (const b of v.bars) b.visible = false;
      } else {
        const L = w.tL[i]!;
        const W = w.tW[i]!;
        v.group.position.set(x, 0.06, z);
        v.group.rotation.y = w.tA[i]!;
        v.ring.visible = false;
        // the fill grows along the length from the far end of the shape (the end away from the boss)
        const fl = Math.max(0.001, 2 * L * p);
        v.fill.scale.set(fl, 2 * W, 1);
        v.fill.rotation.z = 0;
        v.fill.position.set(-L + fl / 2, 0, 0);
        v.fillMat.map!.repeat.set(Math.max(1, (2 * L) / 6), Math.max(1, (2 * W) / 6));
        const t = 0.14;
        const set = (b: THREE.Mesh, px: number, py: number, sx: number, sy: number): void => {
          b.visible = true;
          b.position.set(px, 0, py);
          b.scale.set(sx, sy, 1);
        };
        // (the group is turned about y, the bars lie flat: x runs along the length, "y" of the quad is the width)
        set(v.bars[0]!, 0, W, 2 * L, t);
        set(v.bars[1]!, 0, -W, 2 * L, t);
        set(v.bars[2]!, L, 0, t, 2 * W);
        set(v.bars[3]!, -L, 0, t, 2 * W);
      }
    }
  }
}
