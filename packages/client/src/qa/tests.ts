import * as THREE from 'three';
import { BALANCE, WEAPON_IDS, TICK_DT, Buttons, type WeaponId } from '@wrh/shared';
import { addPlayer, createWorld, hashWorld, runScripted, step } from '@wrh/sim';
import reference from '../../../shared/data/sim-reference.json';
import { aimDirThree, decodeAim, encodeAim, keysToMove, yawForAim } from '../controls';
import { Character, loadGLB } from '../render/character';
import { Stage } from '../render/stage';
import { crowdTests } from './crowd-tests';
import { moreTests } from './more-tests';
import { asset } from '../assets';

export type Status = 'pass' | 'fail' | 'warn';
export interface Result {
  status: Status;
  detail: string;
  data?: unknown;
}
export interface Ctx {
  stage: Stage;
  log(msg: string): void;
  /** Let the browser paint (so the stage shows what is being measured). */
  paint(): Promise<void>;
}
export interface QaTest {
  id: string;
  title: string;
  run(ctx: Ctx): Promise<Result>;
}

const f = (n: number, d = 2): number => +n.toFixed(d);
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const WEAPONS = WEAPON_IDS as readonly WeaponId[];
/** The cranium as a sphere: the chibi head is a wide ball whose lower part tucks behind the chin. */
const CRANIUM_UP = new THREE.Vector3(0, 0.14, 0);
const CRANIUM_R = 0.52;
const REQUIRED_PLAYER_CLIPS = ['aim_idle', 'fire_stand', 'fire_run', 'reload_stand', 'death', 'run_forward', 'run_backward', 'run_left', 'run_right', 'run_forward_left', 'run_forward_right', 'run_backward_left', 'run_backward_right'];
const REQUIRED_ENEMY_CLIPS = ['z_idle', 'z_walk', 'z_run', 'z_attack_swipe', 'z_attack_overhead', 'z_scream', 'z_death_back'];
const BONES = ['root', 'hips', 'spine', 'head', 'armL', 'armR', 'handL', 'handR', 'thighL', 'thighR', 'footL', 'footR'];

/** Measured muzzle data per weapon, filled by the alignment test and exported by the UI. */
export const measured: Record<string, { muzzleFwd: number; muzzleSide: number; muzzleH: number }> = {};

export const tests: QaTest[] = [
  {
    id: 'assets.load',
    title: 'All models and animation libraries load',
    async run() {
      const chars = ['player_base', 'grunt', 'runner', 'tank', 'exploder', 'spitter', 'shielder', 'spawner', 'boss_dev_grunt', 'boss_kral_tank', 'boss_sayaci_ana', 'boss_suru_lideri', 'acc_bandana', 'acc_headphones', 'acc_helmet', 'acc_cap', 'acc_goggles', 'acc_crown', 'acc_horns', 'acc_tophat', 'acc_cowboy', 'acc_ninja', 'acc_mohawk', 'acc_bunny', 'acc_visor', 'acc_pirate', 'acc_wizard', 'acc_viking', 'acc_santa', 'acc_chef', 'acc_astronaut', 'acc_cat', 'acc_halo', 'acc_alien', 'acc_gasmask', 'acc_beanie', 'acc_samurai', 'acc_shades', 'acc_flowers'];
      const weapons = [...WEAPON_IDS, 'grenade'];
      const problems: string[] = [];
      for (const c of chars) {
        const g = await loadGLB(asset(`models/characters/${c}.glb`)).catch(() => null);
        if (!g) problems.push('missing ' + c);
        else {
          const sk = g.scene.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh | undefined;
          const names = sk?.skeleton.bones.map((b) => b.name) ?? [];
          for (const b of BONES) if (!names.includes(b)) problems.push(`${c}: bone ${b} missing`);
        }
      }
      for (const w of weapons) {
        const g = await loadGLB(asset(`models/weapons/weapon_${w}.glb`)).catch(() => null);
        if (!g) problems.push('missing weapon ' + w);
        else {
          const need = w === 'grenade' ? ['grip'] : ['grip', 'muzzle', 'grip_l'];
          for (const n of need) if (!g.scene.getObjectByName(n)) problems.push(`weapon_${w}: node ${n} missing`);
        }
      }
      const pa = await loadGLB(asset('models/anims/player_anims.glb'));
      const ea = await loadGLB(asset('models/anims/enemy_anims.glb'));
      const pn = pa.animations.map((a) => a.name);
      const en = ea.animations.map((a) => a.name);
      for (const c of REQUIRED_PLAYER_CLIPS) if (!pn.includes(c)) problems.push('player clip ' + c + ' missing');
      for (const c of REQUIRED_ENEMY_CLIPS) if (!en.includes(c)) problems.push('enemy clip ' + c + ' missing');
      return {
        status: problems.length ? 'fail' : 'pass',
        detail: problems.length ? problems.join('\n') : `${chars.length} characters, ${weapons.length} weapons, ${pn.length} player clips, ${en.length} enemy clips`,
        data: { playerClips: pn.length, enemyClips: en.length },
      };
    },
  },
  {
    id: 'anim.finite',
    title: 'Animations produce finite, sane bone positions',
    async run(ctx) {
      const ch = await Character.createPlayer({ color: '#1FA2FF', weapon: 'weapon_smg' });
      ctx.stage.scene.add(ch.root);
      const bad: string[] = [];
      let checked = 0;
      for (const clip of ch.clipNames()) {
        for (const frac of [0, 0.25, 0.5, 0.75, 0.99]) {
          ch.poseAt(clip, frac);
          for (const b of ch.bones.values()) {
            const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
            checked++;
            if (![p.x, p.y, p.z].every(Number.isFinite) || p.length() > 6) bad.push(`${clip}@${frac} ${b.name} ${p.toArray().map((v) => f(v)).join(',')}`);
          }
        }
      }
      ctx.stage.scene.remove(ch.root);
      return { status: bad.length ? 'fail' : 'pass', detail: bad.length ? bad.slice(0, 12).join('\n') : `${ch.clipNames().length} clips, ${checked} bone samples`, data: { clips: ch.clipNames().length } };
    },
  },
  {
    id: 'weapon.alignment',
    title: 'Weapon is held along the aim line and upright (all weapons, clips and aim angles)',
    async run(ctx) {
      const clips = ['aim_idle', 'fire_stand', 'run_forward', 'reload_stand'];
      const problems: string[] = [];
      const summary: Record<string, unknown> = {};
      let worstDot = 1;
      for (const w of WEAPONS) {
        if (w === ('grenade' as string)) continue;
        const ch = await Character.createPlayer({ color: '#1FA2FF', weapon: `weapon_${w}` });
        ctx.stage.scene.add(ch.root);
        const fw: number[] = [], sd: number[] = [], hh: number[] = [];
        let wDot = 1, wSide = 0, wUp = 1;
        for (const clip of clips) {
          for (let i = 0; i < 12; i++) {
            const ang = (i * Math.PI) / 6 + 0.1;
            ch.root.position.set(0, 0, 0);
            ch.root.rotation.y = yawForAim(ang);
            ch.poseAt(clip, 0.4);
            const d = aimDirThree(ang);
            const dir = new THREE.Vector3(d.x, 0, d.z);
            ch.applyAim(dir);
            const ax = ch.weaponAxes()!;
            const m = ch.muzzleWorld()!;
            const right = new THREE.Vector3(-dir.z, 0, dir.x);
            const dot = ax.barrel.dot(dir);
            const side = m.dot(right);
            fw.push(m.dot(dir));
            sd.push(side);
            hh.push(m.y);
            wDot = Math.min(wDot, dot);
            wSide = Math.max(wSide, Math.abs(side));
            wUp = Math.min(wUp, ax.up.y);
            if (i % 4 === 0) {
              ctx.log(`${w} ${clip} aim ${f((ang * 180) / Math.PI, 0)} deg`);
              ctx.stage.follow(0, 0);
              ctx.stage.render();
              await ctx.paint();
            }
          }
        }
        measured[w] = { muzzleFwd: f(median(fw)), muzzleSide: f(median(sd)), muzzleH: f(median(hh)) };
        summary[w] = { ...measured[w], worstBarrelDot: f(wDot, 4), maxSide: f(wSide), minUp: f(wUp) };
        worstDot = Math.min(worstDot, wDot);
        if (wDot < 0.995) problems.push(`${w}: barrel off the aim line (dot ${f(wDot, 3)})`);
        if (wSide > 0.45) problems.push(`${w}: muzzle ${f(wSide)} to the side`);
        if (wUp < 0.9) problems.push(`${w}: weapon tilted (up.y ${f(wUp)})`);
        ctx.stage.scene.remove(ch.root);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : `worst barrel dot ${f(worstDot, 4)} (>= 0.995)`, data: summary };
    },
  },
  {
    id: 'weapon.head-clearance',
    title: 'No weapon pokes into the head of its holder in any pose or aim angle',
    async run(ctx) {
      const clips = ['aim_idle', 'fire_stand', 'run_forward', 'reload_stand', 'fire_run'];
      const problems: string[] = [];
      const data: Record<string, unknown> = {};
      for (const w of WEAPONS) {
        const ch = await Character.createPlayer({ color: '#1FA2FF', weapon: `weapon_${w}`, accessory: 'acc_helmet' });
        ctx.stage.scene.add(ch.root);
        let worst = 0;
        let headY = 0;
        let radius = 0;
        const perClip: Record<string, number> = {};
        for (const clip of clips) {
          if (!ch.has(clip)) continue;
          for (let i = 0; i < 12; i++) {
            const ang = (i * Math.PI) / 6 + 0.1;
            ch.root.position.set(0, 0, 0);
            ch.root.rotation.y = yawForAim(ang);
            ch.poseAt(clip, 0.4);
            const d = aimDirThree(ang);
            ch.applyAim(new THREE.Vector3(d.x, 0, d.z));
            const sp = ch.headSphere();
            headY = sp.centre.y;
            radius = sp.radius;
            const pen = ch.weaponPenetration(sp.centre.clone().add(CRANIUM_UP), CRANIUM_R);
            perClip[clip] = Math.max(perClip[clip] ?? 0, f(pen, 2));
            worst = Math.max(worst, pen);
          }
        }
        data[w] = { worstPenetration: f(worst, 3), skullY: f(headY, 2), skullRadius: f(radius, 2), skullSize: [f(ch.lastHeadBox.x), f(ch.lastHeadBox.y), f(ch.lastHeadBox.z)], perClip };
        if (worst > 0.16) problems.push(`${w}: reaches ${f(worst, 2)} into the head`);
        ctx.stage.scene.remove(ch.root);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(String.fromCharCode(10)) : 'every weapon stays clear of the head', data };
    },
  },
  {
    id: 'weapon.muzzle-match',
    title: 'Sim shot origin matches the visual muzzle (balance.json muzzle data)',
    async run() {
      const problems: string[] = [];
      const rows: Record<string, unknown> = {};
      for (const w of WEAPONS) {
        const m = measured[w];
        if (!m) {
          return { status: 'warn', detail: 'run "weapon.alignment" first (it measures the muzzle)' };
        }
        const cfg = BALANCE.weapons[w];
        const dF = Math.abs(cfg.muzzleFwd - m.muzzleFwd);
        const dS = Math.abs(cfg.muzzleSide - m.muzzleSide);
        const dH = Math.abs(cfg.muzzleH - m.muzzleH);
        rows[w] = { configured: [cfg.muzzleFwd, cfg.muzzleSide, cfg.muzzleH], measured: [m.muzzleFwd, m.muzzleSide, m.muzzleH] };
        if (dF > 0.25 || dS > 0.2 || dH > 0.25) problems.push(`${w}: configured ${cfg.muzzleFwd}/${cfg.muzzleSide}/${cfg.muzzleH} vs measured ${m.muzzleFwd}/${m.muzzleSide}/${m.muzzleH}`);
        // and the sim really spawns the bullet there
        const world = createWorld(1);
        addPlayer(world, 0, 0, 0, w);
        const ang = 1.0;
        step(world, [{ moveX: 0, moveY: 0, aim: encodeAim(ang), buttons: Buttons.Fire }]);
        const i = world.bActive.indexOf(1);
        const ox = world.bX[i]! - world.bVx[i]! * TICK_DT;
        const oy = world.bY[i]! - world.bVy[i]! * TICK_DT;
        const fwdD = ox * Math.cos(ang) + oy * Math.sin(ang);
        if (Math.abs(fwdD - cfg.muzzleFwd) > 0.1 + cfg.spread * cfg.muzzleFwd) problems.push(`${w}: sim spawns bullet ${f(fwdD)} ahead, expected ${cfg.muzzleFwd}`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : 'configured and measured muzzle agree for every weapon', data: rows };
    },
  },
  {
    id: 'controls.mapping',
    title: 'W/A/S/D move up/left/down/right on screen; aim and facing agree',
    async run(ctx) {
      const cam = ctx.stage.camera;
      cam.updateMatrixWorld(true);
      ctx.stage.follow(0, 0);
      cam.updateMatrixWorld(true);
      const proj = (x: number, z: number) => new THREE.Vector3(x, 0, z).project(cam);
      const problems: string[] = [];
      const base = proj(0, 0);
      const keys: [string, number, number, (dx: number, dy: number) => boolean][] = [
        ['W', 0, 1, (dx, dy) => dy > 0.5 && Math.abs(dx) < 0.1],
        ['S', 0, -1, (dx, dy) => dy < -0.5 && Math.abs(dx) < 0.1],
        ['A', -1, 0, (dx, dy) => dx < -0.5 && Math.abs(dy) < 0.1],
        ['D', 1, 0, (dx, dy) => dx > 0.5 && Math.abs(dy) < 0.1],
      ];
      for (const [name, kx, ky, ok] of keys) {
        const m = keysToMove(kx, ky);
        const p = proj(m.x * 3, -m.y * 3);
        const dx = (p.x - base.x) / 0.5;
        const dy = (p.y - base.y) / 0.5;
        const n = Math.hypot(dx, dy) || 1;
        if (!ok(dx / n, dy / n)) problems.push(`${name} moves screen (${f(dx / n)}, ${f(dy / n)})`);
      }
      // aim round trip and model yaw
      const ch = await Character.createPlayer({ color: '#1FA2FF' });
      ctx.stage.scene.add(ch.root);
      let maxErr = 0, maxYaw = 0;
      for (let i = 0; i < 360; i++) {
        const a = (i * Math.PI) / 180 - Math.PI;
        const back = decodeAim(encodeAim(a));
        const e = Math.abs(Math.atan2(Math.sin(back - a), Math.cos(back - a)));
        maxErr = Math.max(maxErr, e);
        ch.root.rotation.y = yawForAim(a);
        ch.root.updateMatrixWorld(true);
        const fwd = new THREE.Vector3(0, 0, 1).transformDirection(ch.root.matrixWorld);
        const d = aimDirThree(a);
        maxYaw = Math.max(maxYaw, Math.hypot(fwd.x - d.x, fwd.z - d.z));
      }
      ctx.stage.scene.remove(ch.root);
      if (maxErr > 2e-4) problems.push(`aim quantisation error ${maxErr}`);
      if (maxYaw > 1e-5) problems.push(`model facing differs from aim by ${maxYaw}`);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : `aim quantisation <= ${maxErr.toExponential(1)} rad, facing error <= ${maxYaw.toExponential(1)}` };
    },
  },
  {
    id: 'sim.determinism',
    title: 'Simulation is deterministic and matches the Node reference hashes',
    async run() {
      const problems: string[] = [];
      for (const c of reference.cases) {
        const a = runScripted(c.seed, c.ticks, c.players, c).hash;
        const b = runScripted(c.seed, c.ticks, c.players, c).hash;
        if (a !== b) problems.push(`seed ${c.seed}: two runs differ (${a} vs ${b})`);
        if (a !== c.hash) problems.push(`seed ${c.seed}/${c.ticks} ticks: browser ${a} != Node reference ${c.hash}`);
      }
      const w = createWorld(1);
      addPlayer(w, 0, 0, 0);
      const h0 = hashWorld(w);
      step(w, [{ moveX: 10, moveY: 0, aim: 0, buttons: 0 }]);
      if (hashWorld(w) === h0) problems.push('hash did not change after a step');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join('\n') : `${reference.cases.length} scripted runs equal their Node reference (${navigator.userAgent.split(' ').pop()})` };
    },
  },
  {
    id: 'perf.render',
    title: 'Render performance (character scene)',
    async run(ctx) {
      const ch = await Character.createPlayer({ color: '#1FA2FF', weapon: 'weapon_smg', accessory: 'acc_helmet' });
      ctx.stage.scene.add(ch.root);
      ch.play('run_forward');
      const times: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 90; i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = performance.now();
        times.push(now - last);
        last = now;
        ch.update(1 / 60);
        ch.applyAim(new THREE.Vector3(1, 0, 0));
        ctx.stage.follow(0, 0);
        ctx.stage.render();
      }
      ctx.stage.scene.remove(ch.root);
      const t = times.slice(10);
      const avg = t.reduce((a, b) => a + b, 0) / t.length;
      const info = ctx.stage.renderer.info.render;
      const fps = 1000 / avg;
      return { status: fps >= 30 ? 'pass' : 'warn', detail: `${f(fps, 0)} fps (${f(avg, 1)} ms/frame), ${info.calls} draw calls, ${info.triangles} triangles`, data: { fps, avgMs: avg, calls: info.calls, triangles: info.triangles } };
    },
  },
];

tests.push(...crowdTests, ...moreTests);
