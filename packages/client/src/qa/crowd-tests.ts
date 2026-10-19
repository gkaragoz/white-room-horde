import { Buttons, ENEMY_TYPES, TICK_DT } from '@wrh/shared';
import { addPlayer, createWorld, spawnEnemy, step, type World } from '@wrh/sim';
import { BOSS_TYPES, Crowd } from '../render/crowd';
import { Fx } from '../render/fx';
import type { Ctx, QaTest } from './tests';

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
function grab(ctx: Ctx, size = 360): Uint8Array {
  const gl = ctx.stage.renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const sz = Math.min(size, w, h);
  const out = new Uint8Array(sz * sz * 4);
  gl.readPixels(Math.floor((w - sz) / 2), Math.floor((h - sz) / 2), sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

function diffCount(a: Uint8Array, b: Uint8Array, tol = 24): number {
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
        const meta = (await fetch(`/models/vat/${type}.json`).then((r) => r.json())) as VatMeta;
        const raw: ArrayBuffer = await fetch(`/models/vat/${type}.vat.bin`).then((r) => r.arrayBuffer());
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
];
