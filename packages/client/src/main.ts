import * as THREE from 'three';
import { BALANCE, MAX_BULLETS, PLAYER_COLORS, TICK_DT, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { addPlayer, createWorld, hashWorld, scriptedInput, setWave, step } from '@wrh/sim';
import { pickPlayerClip } from './anim';
import { Input } from './input';
import { Crowd } from './render/crowd';
import { Character } from './render/character';
import { Stage } from './render/stage';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;

const stage = new Stage(app);
const params = new URLSearchParams(location.search);
const weaponParam = (params.get('weapon') ?? 'weapon_pistol').replace('weapon_', '');
const weaponId = (WEAPON_IDS as readonly string[]).includes(weaponParam) ? (weaponParam as WeaponId) : 'pistol';
const botCount = Math.max(0, Math.min(10, Number(params.get('bots') ?? 0)));
const god = params.get('god') === '1';
const auto = params.get('auto') === '1';
const showPerf = params.get('perf') === '1';
const world = createWorld(1);
addPlayer(world, 0, 0, 0, weaponId);
for (let b = 1; b <= botCount; b++) addPlayer(world, b, ((b % 6) - 2.5) * 2, b < 6 ? 2 : -2, b % 2 ? 'smg' : 'ar');
const startWave = Number(params.get('wave') ?? 1);
if (startWave > 1) setWave(world, startWave);
const input = new Input(stage.renderer.domElement, stage.camera);

// bullets: one InstancedMesh, positions come straight from the sim pool
const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshBasicMaterial({ color: '#fff0a8' }), MAX_BULLETS);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
stage.scene.add(bulletMesh);

const crowd = await Crowd.create(150);
stage.scene.add(crowd.group);

const ACCESSORIES = ['acc_bandana', 'acc_cap', 'acc_goggles', 'acc_headphones', 'acc_helmet'];
const players: Character[] = [];
for (let s = 0; s <= botCount; s++) {
  const wid = s === 0 ? weaponId : world.pWeapon[s] === WEAPON_IDS.indexOf('smg') ? 'smg' : 'ar';
  const c = await Character.createPlayer({
    color: PLAYER_COLORS[(s === 0 ? Number(params.get('color') ?? 0) : s) % PLAYER_COLORS.length]!,
    accessory: s === 0 ? (params.get('acc') ?? 'acc_bandana') : ACCESSORIES[s % ACCESSORIES.length]!,
    weapon: 'weapon_' + wid,
  });
  stage.scene.add(c.root);
  players.push(c);
}
const player = players[0]!;

// ?debug=1 (or F2): muzzle (red) vs the sim's shot origin (yellow) and the aim line
const dbg = new THREE.Group();
dbg.visible = params.get('debug') === '1';
const markMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ff2a2a', depthTest: false }));
const markOrigin = new THREE.Mesh(new THREE.SphereGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffd400', depthTest: false }));
const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 8)]), new THREE.LineBasicMaterial({ color: '#2a7bff', depthTest: false }));
for (const o of [markMuzzle, markOrigin, aimLine]) o.renderOrder = 10;
dbg.add(markMuzzle, markOrigin, aimLine);
stage.scene.add(dbg);
window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') dbg.visible = !dbg.visible;
});

// fixed-step loop with interpolation
const nSlots = botCount + 1;
const prevX = new Float64Array(nSlots), prevY = new Float64Array(nSlots), prevA = new Float64Array(nSlots);
const curX = new Float64Array(nSlots), curY = new Float64Array(nSlots), curA = new Float64Array(nSlots);
const moveAngles = new Float64Array(nSlots);
const firing = new Uint8Array(nSlots);
const inputs: PlayerInput[] = new Array<PlayerInput>(nSlots);
let acc = 0;
let last = performance.now();
let frames = 0, fpsT = 0, fps = 0;
let simMs = 0, simSamples = 0, frameMs = 0, frameSamples = 0;
const perf = { fps: 0, simMs: 0, frameMs: 0, calls: 0, triangles: 0, enemies: 0, corpses: 0 };
const dummy = new THREE.Object3D();
const q = new THREE.Quaternion();
const fwd = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

function frame(now: number): void {
  const frameStart = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= TICK_DT) {
    acc -= TICK_DT;
    for (let s = 0; s < nSlots; s++) {
      if (s === 0 && !auto) {
        const smp = input.sample(curX[0]!, curY[0]!);
        inputs[0] = smp.input;
        moveAngles[0] = smp.moveAngle;
      } else {
        const inp = scriptedInput(world.tick, s);
        inputs[s] = inp;
        moveAngles[s] = Math.atan2(inp.moveY, inp.moveX);
      }
      firing[s] = (inputs[s]!.buttons & 1) !== 0 ? 1 : 0;
      prevX[s] = curX[s]!; prevY[s] = curY[s]!; prevA[s] = curA[s]!;
    }
    if (god) for (let s = 0; s < nSlots; s++) world.pHp[s] = BALANCE.player.hp;
    crowd.snapshot(world);
    const t0 = performance.now();
    step(world, inputs);
    simMs += performance.now() - t0;
    simSamples++;
    crowd.onEvents(world, world.events, now / 1000);
    for (let s = 0; s < nSlots; s++) {
      curX[s] = world.pX[s]!; curY[s] = world.pY[s]!; curA[s] = world.pAngle[s]!;
    }
  }
  const a = acc / TICK_DT;

  for (let s = 0; s < nSlots; s++) {
    const c = players[s]!;
    const x = prevX[s]! + (curX[s]! - prevX[s]!) * a;
    const y = prevY[s]! + (curY[s]! - prevY[s]!) * a;
    const ang = lerpAngle(prevA[s]!, curA[s]!, a);
    // sim (x, y) -> three (x, 0, -y); the model faces +Z so yaw = aim + 90 deg
    c.root.position.set(x, 0, -y);
    c.root.rotation.y = ang + Math.PI / 2;
    c.play(pickPlayerClip({ moving: world.pMoving[s] === 1, firing: firing[s] === 1, moveAngle: moveAngles[s]!, facing: curA[s]! }));
    c.update(dt);
    c.applyAim(dir.set(Math.cos(ang), 0, -Math.sin(ang)));
    if (s === 0) {
      if (dbg.visible) {
        const mz = c.muzzleWorld();
        if (mz) markMuzzle.position.copy(mz);
        const st = BALANCE.weapons[weaponId];
        markOrigin.position.set(x + Math.cos(ang) * st.muzzleFwd + Math.sin(ang) * st.muzzleSide, st.muzzleH, -(y + Math.sin(ang) * st.muzzleFwd - Math.cos(ang) * st.muzzleSide));
        aimLine.position.copy(markOrigin.position);
        aimLine.rotation.y = Math.atan2(Math.cos(ang), -Math.sin(ang));
      }
      stage.follow(x, -y);
    }
  }

  crowd.update(world, a, now / 1000);

  // bullets
  let n = 0;
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (!world.bActive[i]) continue;
    dummy.position.set(world.bX[i]!, BALANCE.weapons[WEAPON_IDS[world.pWeapon[world.bOwner[i]!]!]!].muzzleH, -world.bY[i]!);
    q.setFromUnitVectors(fwd, dir.set(world.bVx[i]!, 0, -world.bVy[i]!).normalize());
    dummy.quaternion.copy(q);
    dummy.updateMatrix();
    bulletMesh.setMatrixAt(n++, dummy.matrix);
  }
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true;

  stage.render();
  frameMs += performance.now() - frameStart;
  frameSamples++;

  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(frames / fpsT);
    perf.fps = fps;
    perf.simMs = simSamples ? simMs / simSamples : 0;
    perf.frameMs = frameSamples ? frameMs / frameSamples : 0;
    perf.calls = stage.renderer.info.render.calls;
    perf.triangles = stage.renderer.info.render.triangles;
    perf.enemies = world.enemyCount;
    perf.corpses = crowd.corpseCount;
    frames = 0; fpsT = 0; simMs = 0; simSamples = 0; frameMs = 0; frameSamples = 0;
    hud.innerHTML = `<b>white-room-horde</b> M2 &nbsp; ${fps} fps &nbsp; tick ${world.tick} &nbsp; wave ${world.wave} &nbsp; enemies ${world.enemyCount} &nbsp; kills ${world.kills} &nbsp; hp ${Math.round(world.pHp[0]!)}<br>` +
      `WASD move &middot; mouse aim &middot; click/space fire &nbsp; hash ${hashWorld(world).toString(16)}` +
      (showPerf
        ? `<br>frame ${perf.frameMs.toFixed(2)} ms &middot; sim ${perf.simMs.toFixed(2)} ms &middot; draw calls ${perf.calls} &middot; triangles ${(perf.triangles / 1000).toFixed(0)}k &middot; corpses ${perf.corpses}`
        : '');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__wrh = { world, player, stage, crowd, perf };
