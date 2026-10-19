import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

/** Characters are authored at 1.5x (player) / 1.35x (grunt) ...; hips translation tracks are authored at 1.0. */
export const PLAYER_SCALE = 1.5;

/** Weapon grip placement on the right hand bone (tuned visually, see docs/DESIGN.md "Silah tutusu ve IK"). */
export const HAND_ATTACH = { position: new THREE.Vector3(0, 0.1, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) };

function collectSkinned(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

function tint(mesh: THREE.Mesh, color: THREE.ColorRepresentation): void {
  const apply = (m: THREE.Material): THREE.Material => {
    if (m.name.includes('tint')) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.color.set(color);
      return c;
    }
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
}

export interface CharacterOptions {
  color: THREE.ColorRepresentation;
  accessory?: string; // e.g. 'acc_bandana'
  weapon?: string; // e.g. 'weapon_pistol'
}

/** A skinned chibi with mixer, tinted vest, an accessory bound to the same skeleton and a weapon in the right hand. */
export class Character {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly bones = new Map<string, THREE.Bone>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  currentName = '';

  private constructor(readonly model: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  static async createPlayer(opts: CharacterOptions): Promise<Character> {
    const [base, anims] = await Promise.all([loadGLB('/models/characters/player_base.glb'), loadGLB('/models/anims/player_anims.glb')]);
    const model = SkeletonUtils.clone(base.scene);
    const skinned = collectSkinned(model);
    for (const m of skinned) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      tint(m, opts.color);
    }
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of anims.animations) {
      const clip = c.clone();
      for (const t of clip.tracks) if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * PLAYER_SCALE);
      clips.set(clip.name, clip);
    }
    const ch = new Character(model, clips);
    const skeleton = skinned[0]!.skeleton;
    for (const b of skeleton.bones) ch.bones.set(b.name, b);

    if (opts.accessory) {
      const acc = await loadGLB(`/models/characters/${opts.accessory}.glb`);
      const copy = SkeletonUtils.clone(acc.scene);
      for (const m of collectSkinned(copy)) {
        m.removeFromParent();
        m.bind(skeleton, m.bindMatrix);
        m.castShadow = true;
        m.frustumCulled = false;
        tint(m, opts.color);
        model.add(m);
      }
    }
    if (opts.weapon) await ch.attachWeapon(opts.weapon);
    return ch;
  }

  async attachWeapon(id: string): Promise<void> {
    const hand = this.bones.get('handR') ?? [...this.bones.values()].find((b) => /hand.?r/i.test(b.name));
    if (!hand) throw new Error('right hand bone not found: ' + [...this.bones.keys()].join(','));
    const w = await loadGLB(`/models/weapons/${id}.glb`);
    const g = SkeletonUtils.clone(w.scene);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const holder = new THREE.Group();
    holder.name = 'weapon';
    holder.scale.setScalar(PLAYER_SCALE);
    holder.position.copy(HAND_ATTACH.position);
    holder.rotation.copy(HAND_ATTACH.rotation);
    holder.add(g);
    hand.add(holder);
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  play(name: string, fade = 0.15): void {
    if (name === this.currentName) return;
    const next = this.actions.get(name);
    if (!next) return;
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
