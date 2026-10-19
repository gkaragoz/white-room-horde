import { Buttons, ENEMY_TYPES, TICK_DT } from '@wrh/shared';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '@wrh/sim';
import { BOSS_TYPES, Crowd } from '../render/crowd';
import { Fx } from '../render/fx';
import { RagdollPool } from '../render/ragdoll';
import * as THREE from 'three';
import { Audio, BANK_FILES, MUSIC_FILES } from '../audio';
import { PickupView } from '../render/pickups';
import { Stage, type AaMode } from '../render/stage';
import { webgpuSupported } from '../render/backend';
import type { Ctx, QaTest } from './tests';
import { asset } from '../assets';

interface VatMeta {
  type: string;
  scale: number;
  vertexCount: number;
  frames: number;
  clips: { id: string; start: number; frames: number; loop: boolean; duration: number }[];
}

const f = (n: number, d = 2): number => +n.toFixed(d);
const CROWD_TYPES: string[] = [...ENEMY_TYPES, ...BOSS_TYPES];
let crowdPromise: Promise<Crowd> | null = null;
const getCrowd = (): Promise<Crowd> => (crowdPromise ??= Crowd.create(150));

/** Read the centre of the canvas (RGBA) right after a render. */
export function grab(ctx: Ctx, size = 360): Uint8Array {
  const gl = ctx.stage.renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const sz = Math.min(size, w, h);
  const out = new Uint8Array(sz * sz * 4);
  gl.readPixels(Math.floor((w - sz) / 2), Math.floor((h - sz) / 2), sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

export function diffCount(a: Uint8Array, b: Uint8Array, tol = 24): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > tol) n++;
  return n;
}

/** Vertical extent (pixel rows) of everything that differs from the empty background. */
function silhouette(a: Uint8Array, bg: Uint8Array): { count: number; top: number; bottom: number } {
  const size = Math.sqrt(a.length / 4);
  let count = 0;
  let top = size;
  let bottom = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - bg[i]!) + Math.abs(a[i + 1]! - bg[i + 1]!) + Math.abs(a[i + 2]! - bg[i + 2]!) > 24) {
      const row = Math.floor(i / 4 / size);
      count++;
      if (row < top) top = row;
      if (row > bottom) bottom = row;
    }
  }
  return { count, top, bottom };
}

const half = (h: number): number => {
  const e = (h >> 10) & 31;
  const m = h & 1023;
  const v = e === 0 ? m * 2 ** -24 : e === 31 ? NaN : (1 + m / 1024) * 2 ** (e - 15);
  return h & 0x8000 ? -v : v;
};

export const crowdTests: QaTest[] = [
  {
    id: 'crowd.vat-data',
    title: 'Baked enemy animations really move (all types and clips)',
    async run() {
      const problems: string[] = [];
      let clips = 0;
      for (const type of CROWD_TYPES) {
        const meta = (await fetch(asset(`models/vat/${type}.json`)).then((r) => r.json())) as VatMeta;
        const raw: ArrayBuffer = await fetch(asset(`models/vat/${type}.vat.bin`)).then((r) => r.arrayBuffer());
        const buf = new Uint16Array(raw);
        const n = meta.vertexCount;
        if (buf.length !== meta.frames * n * 4) problems.push(`${type}: texture size ${buf.length} != ${meta.frames}x${n}x4`);
        const frameDev = (row: number, ref: number): number => {
          let mx = 0;
          for (let v = 0; v < n; v += 3) {
            for (let k = 0; k < 3; k++) {
              const d = Math.abs(half(buf[(row * n + v) * 4 + k]!) - half(buf[(ref * n + v) * 4 + k]!));
              if (Number.isNaN(d)) return Infinity;
              if (d > mx) mx = d;
            }
          }
          return mx;
        };
        for (const c of meta.clips) {
          clips++;
          let motion = 0;
          for (let i = 1; i < c.frames; i++) motion = Math.max(motion, frameDev(c.start + i, c.start));
          if (!Number.isFinite(motion)) problems.push(`${type}/${c.id}: NaN or infinite vertex data`);
          else if (motion < 0.15) problems.push(`${type}/${c.id}: frames barely move (max deviation ${f(motion, 3)})`);
          if (c.loop && Number.isFinite(motion)) {
            const closing = frameDev(c.start + c.frames - 1, c.start);
            if (closing > motion * 0.6) problems.push(`${type}/${c.id}: loop does not close (gap ${f(closing, 2)} vs motion ${f(motion, 2)})`);
          }
        }
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 14).join('\n') : `${CROWD_TYPES.length} types, ${clips} clips all animate` };
    },
  },
  {
    id: 'crowd.pose-render',
    title: 'Rendered enemies change pose over a clip, loops close, deaths lie down',
    async run(ctx) {
      const crowd = await getCrowd();
      ctx.stage.scene.add(crowd.group);
      const problems: string[] = [];
      const notes: string[] = [];
      const names: string[] = [...ENEMY_TYPES, ...BOSS_TYPES];
      try {
        ctx.stage.follow(0, 0);
        crowd.debugPose(0, 'z_walk', 0, 99, 99); // off screen: the empty background
        ctx.stage.render();
        const bg = grab(ctx);
        for (const type of ['grunt', 'runner', 'tank', 'boss_kral_tank']) {
          const idx = names.indexOf(type);
          const walk = type === 'runner' ? 'z_run' : 'z_walk';
          const dur = crowd.debugPose(idx, walk, 0)?.clip.duration ?? 1;
          const shots: Uint8Array[] = [];
          for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
            crowd.debugPose(idx, walk, frac * 0.9999 * dur, 0, 0, 0);
            ctx.stage.render();
            shots.push(grab(ctx));
          }
          const sil = silhouette(shots[0]!, bg);
          if (sil.count < 400) problems.push(`${type}: enemy not visible (${sil.count} px)`);
          const changes = [1, 2, 3].map((i) => diffCount(shots[0]!, shots[i]!));
          if (Math.max(...changes) < 60) problems.push(`${type}: ${walk} looks frozen (pixel change ${changes.join('/')})`);
          const closing = diffCount(shots[0]!, shots[4]!);
          if (closing > Math.max(...changes) * 0.8) problems.push(`${type}: loop seam visible (end differs by ${closing} px vs ${Math.max(...changes)} mid-cycle)`);
          notes.push(`${type} ${sil.count}px, motion ${Math.max(...changes)}px`);
        }
        // death: the silhouette must get shorter and stay in view
        for (const type of ['grunt', 'tank']) {
          const idx = names.indexOf(type);
          const d = crowd.debugPose(idx, 'z_death_back', 0, 0, 0, 0)!;
          ctx.stage.render();
          const alive = silhouette(grab(ctx), bg);
          crowd.debugPose(idx, 'z_death_back', d.clip.duration, 0, 0, 0);
          ctx.stage.render();
          const dead = silhouette(grab(ctx), bg);
          const h0 = alive.bottom - alive.top;
          const h1 = dead.bottom - dead.top;
          if (dead.count < 150) problems.push(`${type}: corpse invisible`);
          if (!(h1 < h0 * 0.8)) problems.push(`${type}: death pose is not lower than standing (${h1}px vs ${h0}px)`);
          notes.push(`${type} death ${h0}px to ${h1}px`);
        }
      } finally {
        for (let i = 0; i < crowd.typeCount; i++) crowd.debugPose(i, 'z_walk', 0, 999, 999);
        ctx.stage.render();
        ctx.stage.scene.remove(crowd.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : notes.join('; ') };
    },
  },
  {
    id: 'crowd.live-animation',
    title: 'Chasing enemies animate while they move and face where they go',
    async run() {
      const crowd = await getCrowd();
      const problems: string[] = [];
      const notes: string[] = [];
      for (const type of ['grunt', 'runner', 'tank', 'spitter']) {
        const w: World = createWorld(5);
        w.waveTick = 1e9;
        w.countMul = 0;
        addPlayer(w, 0, 0, 0);
        const idx = ENEMY_TYPES.indexOf(type as (typeof ENEMY_TYPES)[number]);
        const id = spawnEnemy(w, idx, 24, 0, false);
        const rows = new Set<number>();
        let travelled = 0;
        let lastX = w.eX[id]!;
        let lastY = w.eY[id]!;
        let headingErr = 0;
        let headingN = 0;
        for (let fr = 0; fr < 150 && w.eActive[id]; fr++) {
          crowd.snapshot(w);
          step(w, [{ moveX: 0, moveY: 0, aim: 0, buttons: 0 }]);
          for (const a of [0.5, 1]) {
            crowd.update(w, a, w.tick * TICK_DT + a * TICK_DT);
            const inst = crowd.debugInstances(idx)[0];
            if (inst) rows.add(Math.round(inst.rowA));
          }
          const dx = w.eX[id]! - lastX;
          const dy = w.eY[id]! - lastY;
          travelled += Math.hypot(dx, dy);
          if (Math.hypot(dx, dy) > 0.01 && w.eState[id] === 0) {
            let e = Math.atan2(dy, dx) - w.eAngle[id]!;
            e = Math.atan2(Math.sin(e), Math.cos(e));
            headingErr = Math.max(headingErr, Math.abs(e));
            headingN++;
          }
          lastX = w.eX[id]!;
          lastY = w.eY[id]!;
        }
        if (rows.size < 6) problems.push(`${type}: only ${rows.size} distinct animation rows while moving ${f(travelled)} units`);
        if (headingN > 5 && headingErr > 0.9) problems.push(`${type}: heading differs from movement by ${f(headingErr)} rad`);
        notes.push(`${type}: ${rows.size} rows over ${f(travelled)} u, heading error ${f(headingErr)}`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : notes.join('; ') };
    },
  },
  {
    id: 'crowd.death-corpse',
    title: 'Kills leave a corpse that is knocked back and rests; gore particles appear and expire',
    async run(ctx) {
      const crowd = await getCrowd();
      const fx = new Fx();
      ctx.stage.scene.add(fx.group);
      const w = createWorld(8);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, -8, 0, 'ar');
      const k = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 0, 0, false);
      w.eCooldown[k] = 1e9;
      let died = false;
      let now = 0;
      const before = crowd.corpseCount;
      for (let t = 0; t < 120 && !died; t++) {
        crowd.snapshot(w);
        step(w, [{ moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Fire }]);
        now += TICK_DT;
        for (const e of w.events) {
          fx.onEvent(e, 0);
          if (e.type === 'enemyDeath') died = true;
        }
        crowd.onEvents(w, w.events, now);
        crowd.update(w, 1, now);
        fx.update(TICK_DT);
      }
      const problems: string[] = [];
      if (!died) problems.push('enemy never died');
      if (crowd.corpseCount !== before + 1) problems.push(`corpse count ${crowd.corpseCount}, expected ${before + 1}`);
      const burst = fx.particleCount;
      if (burst < 8) problems.push(`only ${burst} gore particles right after the kill`);
      const idx = ENEMY_TYPES.indexOf('grunt');
      crowd.update(w, 1, now + 0.02);
      const early = crowd.debugInstances(idx).at(-1);
      crowd.update(w, 1, now + 1.5);
      const mid = crowd.debugInstances(idx).at(-1);
      crowd.update(w, 1, now + 3);
      const rest = crowd.debugInstances(idx).at(-1);
      crowd.update(w, 1, now + 3.1);
      const rest2 = crowd.debugInstances(idx).at(-1);
      if (early && mid && Math.hypot(mid.x - early.x, mid.z - early.z) < 0.15) problems.push('corpse was not knocked back');
      if (rest && rest2 && Math.hypot(rest2.x - rest.x, rest2.z - rest.z) > 0.05) problems.push('corpse still sliding after 3 s');
      for (let i = 0; i < 400; i++) fx.update(0.016);
      if (fx.particleCount !== 0) problems.push(`${fx.particleCount} particles never expired`);
      ctx.stage.scene.remove(fx.group);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : `${burst} particles at the kill, corpse knocked back and then at rest` };
    },
  },
  {
    id: 'ragdoll.physics',
    title: 'Ragdolls fall, tumble along the shot, never sink into the floor and come to rest',
    async run(ctx) {
      const pool = await RagdollPool.create(6);
      await pool.preload(['grunt', 'tank']);
      ctx.stage.scene.add(pool.group);
      const problems: string[] = [];
      const notes: string[] = [];
      try {
        for (const type of ['grunt', 'tank']) {
          pool.clear();
          const ok = pool.spawn(type, 0, 0, 0.5, 'z_walk', 0.4, { x: 1, z: 0 }, { x: 1, z: 0, power: 40 });
          if (!ok) {
            problems.push(`${type}: spawn failed`);
            continue;
          }
          const start = pool.debugJoint('hips')!.clone();
          let minY = 9;
          let maxSpeed = 0;
          let last = start.clone();
          for (let i = 0; i < 60 * 6; i++) {
            pool.update(1 / 60);
            for (const j of ['hips', 'head', 'handL', 'footR'] as const) minY = Math.min(minY, pool.debugJoint(j)!.y);
            const h = pool.debugJoint('hips')!;
            maxSpeed = Math.max(maxSpeed, h.distanceTo(last) * 60);
            last = h.clone();
          }
          const end = pool.debugJoint('hips')!;
          const thrown = end.x - start.x;
          const drawn = pool.debugBoneWorld('hips')!;
          const headBone = pool.debugBoneWorld('head')!;
          const headPart = pool.debugJoint('head')!;
          if (minY < 0.05) problems.push(`${type}: a joint went through the floor (y ${f(minY, 3)})`);
          if (thrown < 0.4) problems.push(`${type}: barely thrown along the shot (${f(thrown)} u)`);
          if (maxSpeed > 30) problems.push(`${type}: unstable, hips reached ${f(maxSpeed)} u/s`);
          if (pool.awakeCount !== 0) problems.push(`${type}: still simulating after 6 s`);
          if (drawn.distanceTo(end) > 0.15) problems.push(`${type}: hips bone is ${f(drawn.distanceTo(end))} u from its physics joint`);
          if (headBone.distanceTo(headPart) > 0.9) problems.push(`${type}: head bone ${f(headBone.distanceTo(headPart))} u from its physics joint (skeleton follows poorly)`);
          if (end.y > 1.0) problems.push(`${type}: resting hips are ${f(end.y)} u high, not lying down`);
          notes.push(`${type}: thrown ${f(thrown)} u, rests at hip height ${f(end.y)}, peak ${f(maxSpeed)} u/s`);
        }
      } finally {
        pool.clear();
        ctx.stage.scene.remove(pool.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : notes.join('; ') };
    },
  },
  {
    id: 'audio.bank',
    title: 'Every recorded sound effect decodes in this browser and has a sane length',
    async run() {
      const hasAudio = typeof window.AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
      if (!hasAudio) return { status: 'warn', detail: 'this browser build has no WebAudio (the game then plays without sound), skipped' };
      const a = new Audio();
      a.unlock();
      const { loaded, durations } = await a.whenLoaded();
      const missing = [...BANK_FILES, ...MUSIC_FILES.map((m) => 'music:' + m)].filter((x) => !loaded.includes(x));
      const long = Object.entries(durations).filter(([k, d]) => (k.startsWith('music:') ? d < 30 || d > 400 : d > 6 || d < 0.008));
      const problems: string[] = [];
      if (missing.length) problems.push(`not decoded: ${missing.join(', ')}`);
      if (long.length) problems.push(`odd lengths: ${long.map(([k, d]) => `${k} ${f(d)}s`).join(', ')}`);
      const total = Object.values(durations).reduce((x, y) => x + y, 0);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${loaded.length} samples, ${f(total, 1)} s of audio` };
    },
  },
  {
    id: 'stage.aa-modes',
    title: 'Anti-aliasing modes render correctly: same brightness, smoother edges than off',
    async run() {
      const results: Record<string, { mean: number; edge: number; cube: number }> = {};
      for (const mode of ['off', 'msaa', 'smaa'] as AaMode[]) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;opacity:0;pointer-events:none';
        document.body.appendChild(div);
        const st = await Stage.create(div, { aa: mode, bounce: true });
        st.renderer.setPixelRatio(1);
        st.resize();
        if (mode === 'smaa') await new Promise((r) => setTimeout(r, 600)); // SMAA lookup textures load asynchronously
        const read = (): { px: Uint8Array; w: number; h: number } => {
          const gl = st.renderer.getContext();
          const w = gl.drawingBufferWidth;
          const h = gl.drawingBufferHeight;
          const px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return { px, w, h };
        };
        st.follow(0, 0);
        st.render();
        const bg = read();
        const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: '#d02020' }));
        cube.rotation.set(0.4, 0.7, 0.2);
        cube.position.set(0, 1, 0);
        st.scene.add(cube);
        st.render();
        const img = read();
        // contrast of every pixel against the empty scene; interior pixels have the full contrast, edge pixels in between
        const diff = new Float32Array(img.w * img.h);
        let sum = 0;
        let full = 0;
        for (let i = 0; i < diff.length; i++) {
          const d = Math.abs(img.px[i * 4]! - bg.px[i * 4]!) + Math.abs(img.px[i * 4 + 1]! - bg.px[i * 4 + 1]!) + Math.abs(img.px[i * 4 + 2]! - bg.px[i * 4 + 2]!);
          diff[i] = d;
          sum += img.px[i * 4]! + img.px[i * 4 + 1]! + img.px[i * 4 + 2]!;
          if (d > full) full = d;
        }
        let cubePx = 0;
        let soft = 0;
        for (let i = 0; i < diff.length; i++) {
          if (diff[i]! > full * 0.85) cubePx++;
          else if (diff[i]! > full * 0.12) soft++;
        }
        results[mode] = { mean: sum / diff.length / 3, edge: soft, cube: cubePx };
        st.renderer.dispose();
        st.renderer.forceContextLoss();
        div.remove();
      }
      const problems: string[] = [];
      const r = results as Record<AaMode, { mean: number; edge: number; cube: number }>;
      for (const m of ['off', 'msaa', 'smaa'] as const) if (r[m].cube < 300) problems.push(`${m}: test cube not visible (${r[m].cube} px)`);
      for (const m of ['msaa', 'smaa'] as const) {
        if (Math.abs(r[m].mean - r.off.mean) > r.off.mean * 0.15 + 3) problems.push(`${m}: brightness ${f(r[m].mean, 1)} vs off ${f(r.off.mean, 1)} (tone mapping or colour space differs)`);
        if (r[m].edge < r.off.edge * 1.3 + 40) problems.push(`${m}: edges are not smoother than off (${r[m].edge} vs ${r.off.edge} soft-edge pixels)`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : Object.entries(r).map(([k, v]) => `${k}: mean ${f(v.mean, 1)}, cube ${v.cube}px, soft edges ${v.edge}`).join('; ') };
    },
  },
  {
    id: 'webgpu.crowd-pose',
    title: 'WebGPU renderer: crowd animates, loops close, deaths lie down (same checks as WebGL)',
    async run() {
      if (!(await webgpuSupported())) return { status: 'warn', detail: 'WebGPU is not available in this browser, skipped' };
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;opacity:0;pointer-events:none';
      document.body.appendChild(div);
      const st = await Stage.create(div, { aa: 'msaa', bounce: true, backend: 'webgpu' });
      const crowd = await Crowd.create(10, 'webgpu');
      st.scene.add(crowd.group);
      const problems: string[] = [];
      const notes: string[] = [];
      try {
        const size = 300;
        const rt = new THREE.RenderTarget(size, size, { type: THREE.UnsignedByteType });
        const names: string[] = [...ENEMY_TYPES, ...BOSS_TYPES];
        const shot = async (): Promise<Uint8Array> => {
          const r = st.renderer as unknown as {
            setRenderTarget(t: THREE.RenderTarget | null): void;
            render(s: THREE.Scene, c: THREE.Camera): void;
            readRenderTargetPixelsAsync(t: THREE.RenderTarget, x: number, y: number, w: number, h: number): Promise<Uint8Array>;
          };
          r.setRenderTarget(rt);
          r.render(st.scene, st.camera);
          r.setRenderTarget(null);
          const px = await r.readRenderTargetPixelsAsync(rt, 0, 0, size, size);
          return new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
        };
        st.resize();
        st.camera.left = -4;
        st.camera.right = 4;
        st.camera.top = 4;
        st.camera.bottom = -4;
        st.camera.updateProjectionMatrix();
        st.follow(0, 0);
        crowd.debugPose(0, 'z_walk', 0, 99, 99);
        const bg = await shot();
        for (const type of ['grunt', 'tank']) {
          const idx = names.indexOf(type);
          const dur = crowd.debugPose(idx, 'z_walk', 0)?.clip.duration ?? 1;
          const shots: Uint8Array[] = [];
          for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
            crowd.debugPose(idx, 'z_walk', frac * 0.9999 * dur, 0, 0, 0);
            shots.push(await shot());
          }
          const sil = silhouette(shots[0]!, bg);
          if (sil.count < 400) problems.push(`${type}: not visible on WebGPU (${sil.count} px)`);
          const changes = [1, 2, 3].map((k) => diffCount(shots[0]!, shots[k]!));
          if (Math.max(...changes) < 60) problems.push(`${type}: frozen on WebGPU (${changes.join('/')})`);
          const closing = diffCount(shots[0]!, shots[4]!);
          if (closing > Math.max(...changes) * 0.8) problems.push(`${type}: loop seam visible on WebGPU`);
          const d = crowd.debugPose(idx, 'z_death_back', 0, 0, 0, 0)!;
          const alive = silhouette(await shot(), bg);
          crowd.debugPose(idx, 'z_death_back', d.clip.duration, 0, 0, 0);
          const dead = silhouette(await shot(), bg);
          if (!(dead.bottom - dead.top < (alive.bottom - alive.top) * 0.8)) problems.push(`${type}: death pose not lower on WebGPU`);
          notes.push(`${type}: ${sil.count}px, motion ${Math.max(...changes)}px, death ${alive.bottom - alive.top} to ${dead.bottom - dead.top}`);
        }
        rt.dispose();
      } finally {
        (st.renderer as unknown as { dispose(): void }).dispose();
        div.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : notes.join('; ') };
    },
  },
  {
    id: 'audio.spatial',
    title: 'Positional audio: left/right panning follows the screen, louder when close',
    async run() {
      const a = new Audio();
      a.setListener(0, 0);
      const problems: string[] = [];
      const screenRight = { x: Math.cos((30 * Math.PI) / 180), y: Math.sin((30 * Math.PI) / 180) };
      const right = a.spatial({ x: screenRight.x * 8, y: screenRight.y * 8 });
      const left = a.spatial({ x: -screenRight.x * 8, y: -screenRight.y * 8 });
      const near = a.spatial({ x: 0.5, y: 0 });
      const far = a.spatial({ x: 25, y: 0 });
      const here = a.spatial({ x: 0, y: 0 });
      if (!(right.pan > 0.3)) problems.push(`source on the right pans ${f(right.pan)}`);
      if (!(left.pan < -0.3)) problems.push(`source on the left pans ${f(left.pan)}`);
      if (Math.abs(here.pan) > 0.01 || here.gain < 0.99) problems.push('a sound at the listener is not centred and full');
      if (!(far.gain < near.gain * 0.3)) problems.push(`far ${f(far.gain, 3)} is not much quieter than near ${f(near.gain, 3)}`);
      // moving the listener moves the stereo image
      a.setListener(20, 0);
      const moved = a.spatial({ x: 0, y: 0 });
      if (!(moved.pan < -0.3)) problems.push('moving the listener right did not move the source to the left');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `right ${f(right.pan)}, left ${f(left.pan)}, near ${f(near.gain, 2)}, far ${f(far.gain, 2)}` };
    },
  },
  {
    id: 'pickups.render',
    title: 'Dropped loot is drawn (ammo, health, grenade) and disappears when collected',
    async run(ctx) {
      const w = createWorld(3);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0);
      const view = new PickupView();
      ctx.stage.scene.add(view.group);
      const problems: string[] = [];
      try {
        ctx.stage.follow(0, 0);
        view.update(w, 0.3);
        ctx.stage.render();
        const bg = grab(ctx);
        const sizes: number[] = [];
        for (const kind of [0, 1, 2]) {
          w.kActive.fill(0);
          w.kActive[0] = 1;
          w.kType[0] = kind;
          w.kX[0] = 0;
          w.kY[0] = 0;
          w.kLife[0] = 15;
          view.update(w, 0.3);
          ctx.stage.render();
          const px = silhouette(grab(ctx), bg).count;
          sizes.push(px);
          if (px < 150) problems.push(`pickup kind ${kind} barely visible (${px} px)`);
        }
        w.kActive.fill(0);
        view.update(w, 0.3);
        ctx.stage.render();
        const gone = silhouette(grab(ctx), bg).count;
        if (gone > 30) problems.push(`${gone} px still drawn after the pickup was removed`);
      } finally {
        ctx.stage.scene.remove(view.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'ammo, health and grenade crates visible and removed cleanly' };
    },
  },
];
