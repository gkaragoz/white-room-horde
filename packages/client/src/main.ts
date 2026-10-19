import * as THREE from 'three';
import { BALANCE, MAX_BULLETS, PLAYER_COLORS, TICK_DT, WEAPON_IDS, type WeaponId } from '@wrh/shared';
import { addPlayer, createWorld, hashWorld, step } from '@wrh/sim';
import { pickPlayerClip } from './anim';
import { Input } from './input';
import { Character } from './render/character';
import { Stage } from './render/stage';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;

const stage = new Stage(app);
const params = new URLSearchParams(location.search);
const weaponParam = (params.get('weapon') ?? 'weapon_pistol').replace('weapon_', '');
const weaponId = (WEAPON_IDS as readonly string[]).includes(weaponParam) ? (weaponParam as WeaponId) : 'pistol';
const world = createWorld(1);
addPlayer(world, 0, 0, 0, weaponId);
const input = new Input(stage.renderer.domElement, stage.camera);

// bullets: one InstancedMesh, positions come straight from the sim pool
const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshBasicMaterial({ color: '#fff0a8' }), MAX_BULLETS);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
stage.scene.add(bulletMesh);

const player = await Character.createPlayer({
  color: PLAYER_COLORS[Number(params.get('color') ?? 0) % PLAYER_COLORS.length]!,
  accessory: params.get('acc') ?? 'acc_bandana',
  weapon: 'weapon_' + weaponId,
});
stage.scene.add(player.root);
console.log('bones:', [...player.bones.keys()].join(', '));

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
let prevX = 0, prevY = 0, curX = 0, curY = 0, prevAngle = 0, curAngle = 0;
let acc = 0;
let last = performance.now();
let moveAngle = 0;
let firing = false;
let frames = 0, fpsT = 0, fps = 0;
const dummy = new THREE.Object3D();
const q = new THREE.Quaternion();
const fwd = new THREE.Vector3(0, 0, 1);

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= TICK_DT) {
    acc -= TICK_DT;
    const s = input.sample(curX, curY);
    prevX = curX; prevY = curY; prevAngle = curAngle;
    step(world, [s.input]);
    curX = world.pX[0]!; curY = world.pY[0]!; curAngle = world.pAngle[0]!;
    moveAngle = s.moveAngle;
    firing = (s.input.buttons & 1) !== 0;
  }
  const a = acc / TICK_DT;
  const x = prevX + (curX - prevX) * a;
  const y = prevY + (curY - prevY) * a;
  const ang = lerpAngle(prevAngle, curAngle, a);

  // sim (x, y) -> three (x, 0, -y); the model faces +Z so yaw = aim + 90 deg
  player.root.position.set(x, 0, -y);
  player.root.rotation.y = ang + Math.PI / 2;
  player.play(pickPlayerClip({ moving: world.pMoving[0] === 1, firing, moveAngle, facing: curAngle }));
  player.update(dt);
  player.applyAim(new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)));
  if (dbg.visible) {
    const mz = player.muzzleWorld();
    if (mz) markMuzzle.position.copy(mz);
    const st = BALANCE.weapons[weaponId];
    markOrigin.position.set(x + Math.cos(ang) * st.muzzleFwd + Math.sin(ang) * st.muzzleSide, st.muzzleH, -(y + Math.sin(ang) * st.muzzleFwd - Math.cos(ang) * st.muzzleSide));
    aimLine.position.copy(markOrigin.position);
    aimLine.rotation.y = Math.atan2(Math.cos(ang), -Math.sin(ang));
  }
  stage.follow(x, -y);

  // bullets
  let n = 0;
  for (let i = 0; i < MAX_BULLETS; i++) {
    if (!world.bActive[i]) continue;
    dummy.position.set(world.bX[i]!, BALANCE.weapons[WEAPON_IDS[world.pWeapon[world.bOwner[i]!]!]!].muzzleH, -world.bY[i]!);
    q.setFromUnitVectors(fwd, new THREE.Vector3(world.bVx[i]!, 0, -world.bVy[i]!).normalize());
    dummy.quaternion.copy(q);
    dummy.updateMatrix();
    bulletMesh.setMatrixAt(n++, dummy.matrix);
  }
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true;

  stage.render();

  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  hud.innerHTML = `<b>white-room-horde</b> M1 &nbsp; ${fps} fps &nbsp; tick ${world.tick} &nbsp; hash ${hashWorld(world).toString(16)}<br>` +
    `WASD move &middot; mouse aim &middot; click/space fire &nbsp; clip: ${player.currentName}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__wrh = { world, player, stage };
