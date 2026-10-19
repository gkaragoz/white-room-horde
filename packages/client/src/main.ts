import * as THREE from 'three';
import { BALANCE, Buttons, ENEMY_TYPES, MAX_BULLETS, MAX_GRENADES, MAX_SPIT, OBSTACLES, MAX_PLAYERS, PLAYER_COLORS, PlayerState, TICK_DT, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { createGame, decodeReplay, encodeReplay, hashWorld, Recorder, scriptedInput, setWave, spawnBoss, step, type Replay, type SimEvent, type World } from '@wrh/sim';
import { NetSession } from '@wrh/net';
import { Audio } from './audio';
import { pickPlayerClip } from './anim';
import { Input } from './input';
import { Character } from './render/character';
import { Crowd } from './render/crowd';
import { PickupView } from './render/pickups';
import { RagdollPool } from './render/ragdoll';
import { Fx } from './render/fx';
import { pickBackend } from './render/backend';
import { Stage } from './render/stage';
import { Ui, type Settings } from './ui';

const app = document.getElementById('app')!;
document.getElementById('hud')?.remove();
const params = new URLSearchParams(location.search);

// ---- settings (persisted) ----
function loadSettings(): Settings {
  const def: Settings = { music: 0.5, renderer: 'webgl', aa: 'msaa', bounce: true, volume: 0.6, shadows: 2, scale: 1, lang: navigator.language.startsWith('tr') ? 'tr' : 'en' };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem('wrh.settings') ?? '{}') as Partial<Settings>) };
  } catch {
    return def;
  }
}
let settings = loadSettings();

const wantBackend = params.get('renderer') === 'webgpu' ? 'webgpu' : params.get('renderer') === 'webgl' ? 'webgl' : settings.renderer;
const backend = await pickBackend(wantBackend);
const stage = await Stage.create(app, { aa: settings.aa, bounce: settings.bounce, backend });
const audio = new Audio();
const input = new Input(stage.renderer.domElement, stage.camera);
const fx = new Fx();
stage.scene.add(fx.group);
const crowd = await Crowd.create(150, backend);
stage.scene.add(crowd.group);
const ragdolls = await RagdollPool.create(14);
await ragdolls.preload([...ENEMY_TYPES]);
stage.scene.add(ragdolls.group);
const pickups = new PickupView();
stage.scene.add(pickups.group);

const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshBasicMaterial({ color: '#fff0a8' }), MAX_BULLETS);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
stage.scene.add(bulletMesh);

// cover boxes
const crateMat = new THREE.MeshStandardMaterial({ color: '#c8b393', roughness: 0.9, flatShading: true });
const crateTop = new THREE.MeshStandardMaterial({ color: '#e0d2b4', roughness: 0.9, flatShading: true });
for (const o of OBSTACLES) {
  const h = 1.1;
  const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), [crateMat, crateMat, crateTop, crateMat, crateMat, crateMat]);
  box.position.set(o.x, h / 2, -o.y);
  box.castShadow = true;
  box.receiveShadow = true;
  stage.scene.add(box);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, 0.12, o.h + 0.1), new THREE.MeshStandardMaterial({ color: '#8b7a5e', roughness: 1, flatShading: true }));
  rim.position.set(o.x, 0.06, -o.y);
  stage.scene.add(rim);
}

// grenades and spit
const grenadeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: '#4d6b3a', roughness: 0.7, flatShading: true }), MAX_GRENADES);
grenadeMesh.frustumCulled = false;
grenadeMesh.castShadow = true;
const spitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#9bff4a' }), MAX_SPIT);
spitMesh.frustumCulled = false;
stage.scene.add(grenadeMesh, spitMesh);

function applySettings(): void {
  audio.setVolume(settings.volume);
  audio.setMusicVolume(settings.music);
  stage.setShadowQuality(settings.shadows);
  stage.setScale(settings.scale);
  stage.setBounce(settings.bounce);
  ui.applySettings(settings);
  try {
    localStorage.setItem('wrh.settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

// ---- game state ----
type Mode = 'menu' | 'solo' | 'online';
let mode: Mode = 'menu';
let world: World | null = null;
let session: NetSession | null = null;
let ws: WebSocket | null = null;
let localSlot = 0;
let names: string[] = [];
let lobbySig = '';
let over = false;
let paused = false;
let recorder: Recorder | null = null;
let playback: Replay | null = null;
const dev = {
  perf: params.get('perf') === '1',
  bots: Math.max(0, Math.min(10, Number(params.get('bots') ?? 0))),
  auto: params.get('auto') === '1',
  god: params.get('god') === '1',
  wave: Number(params.get('wave') ?? 1),
};
const weaponParam = (params.get('weapon') ?? 'weapon_pistol').replace('weapon_', '');
let startWeapon: WeaponId = (WEAPON_IDS as readonly string[]).includes(weaponParam) ? (weaponParam as WeaponId) : 'pistol';

const ui = new Ui(
  document.body,
  {
    onSolo: (name) => startSolo(name),
    onHost: (name, server) => connect(name, server, null),
    onJoin: (name, code, server) => connect(name, server, code),
    onWeapon: (wp) => {
      startWeapon = wp;
      session?.setWeapon(wp);
    },
    onStart: () => session?.start(),
    onLeave: () => location.reload(),
    onCard: (i) => input.queueButton([Buttons.Card1, Buttons.Card2, Buttons.Card3][i]!),
    onAgain: () => location.reload(),
    onUiSound: (n) => audio.ui(n),
    onResume: () => setPaused(false),
    onReplay: () => downloadReplay(),
    onSetting: (key, value) => {
      if (key === 'volume') settings = { ...settings, volume: value as number };
      else if (key === 'music') settings = { ...settings, music: value as number };
      else if (key === 'shadows') settings = { ...settings, shadows: value as 0 | 1 | 2 };
      else if (key === 'scale') settings = { ...settings, scale: value as number };
      else if (key === 'renderer') {
        settings = { ...settings, renderer: value as Settings['renderer'] };
        applySettings();
        location.reload();
        return;
      } else if (key === 'bounce') settings = { ...settings, bounce: value as boolean };
      else if (key === 'aa') {
        settings = { ...settings, aa: value as Settings['aa'] };
        applySettings();
        location.reload();
        return;
      }
      else settings = { ...settings, lang: value as 'en' | 'tr' };
      applySettings();
    },
  },
  settings,
);
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
ui.weapon = startWeapon;
applySettings();

// ---- characters ----
const chars: (Character | null)[] = new Array<Character | null>(MAX_PLAYERS).fill(null);
const charWeapon = new Int32Array(MAX_PLAYERS).fill(-1);
const loading = new Set<number>();
const ACCESSORIES = ['acc_bandana', 'acc_cap', 'acc_goggles', 'acc_headphones', 'acc_helmet'];

function ensureCharacter(s: number): void {
  if (chars[s] || loading.has(s) || !world) return;
  loading.add(s);
  const wid = WEAPON_IDS[world.pWeapon[s]!]!;
  void Character.createPlayer({
    color: PLAYER_COLORS[s % PLAYER_COLORS.length]!,
    accessory: s === 0 && params.get('acc') ? params.get('acc')! : ACCESSORIES[s % ACCESSORIES.length]!,
    weapon: 'weapon_' + wid,
  }).then((c) => {
    stage.scene.add(c.root);
    chars[s] = c;
    charWeapon[s] = world!.pWeapon[s]!;
  });
}

// ---- interpolation state ----
const prevX = new Float64Array(MAX_PLAYERS), prevY = new Float64Array(MAX_PLAYERS), prevA = new Float64Array(MAX_PLAYERS);
const curX = new Float64Array(MAX_PLAYERS), curY = new Float64Array(MAX_PLAYERS), curA = new Float64Array(MAX_PLAYERS);
const moveAngle = new Float64Array(MAX_PLAYERS);
const lastShot = new Float64Array(MAX_PLAYERS).fill(-10);
let lastStepAt = performance.now();
let nowSec = 0;
let catchingUp = false;

function beforeStep(w: World): void {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    prevX[s] = curX[s]!;
    prevY[s] = curY[s]!;
    prevA[s] = curA[s]!;
  }
  crowd.snapshot(w);
}

function afterStep(w: World): void {
  lastStepAt = performance.now();
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    if (prevX[s] === 0 && prevY[s] === 0 && curX[s] === 0 && curY[s] === 0) {
      prevX[s] = w.pX[s]!;
      prevY[s] = w.pY[s]!;
    }
    curX[s] = w.pX[s]!;
    curY[s] = w.pY[s]!;
    curA[s] = w.pAngle[s]!;
    const dx = curX[s]! - prevX[s]!;
    const dy = curY[s]! - prevY[s]!;
    if (dx * dx + dy * dy > 1e-6) moveAngle[s] = Math.atan2(dy, dx);
  }
  if (!catchingUp) crowd.onEvents(w, w.events, nowSec, (e) => tryRagdoll(w, e));
  for (const e of w.events) handleEvent(e);
}

/** Hard hits and blasts throw the body as a physical ragdoll; lighter kills play the baked death animation. */
function tryRagdoll(w: World, e: Extract<SimEvent, { type: 'enemyDeath' }>): boolean {
  const type = ENEMY_TYPES[e.etype]!;
  if (type === 'exploder' || w.eBoss[e.id] || !ragdolls.ready) return false;
  if (!(e.power >= BALANCE.progression.ragdollPower || Math.random() < 0.25)) return false;
  const info = crowd.deathInfo(w, e.id);
  // sim (x, y) -> three (x, z = -y)
  return ragdolls.spawn(type, e.x, -e.y, info.yaw, info.clip, info.time, { x: info.vx * 0.5, z: -info.vy * 0.5 }, { x: e.dx, z: -e.dy, power: e.power });
}

function handleEvent(e: SimEvent): void {
  if (e.type === 'shot') lastShot[e.slot] = nowSec;
  if (catchingUp) return;
  fx.onEvent(e, localSlot);
  audio.onEvent(e, localSlot);
  switch (e.type) {
    case 'enemyHit':
      crowd.hit(e.id);
      if (Math.random() < 0.6) damageNumber(e.x, e.y, e.damage);
      break;
    case 'waveStart':
      ui.banner(e.boss ? (ui.lang === 'tr' ? 'BOSS GELİYOR!' : 'BOSS INCOMING!') : `${ui.lang === 'tr' ? 'Dalga' : 'Wave'} ${e.wave}`, '', e.boss ? 3500 : 1800);
      break;
    case 'levelUp':
      ui.banner(ui.lang === 'tr' ? 'Seviye atlandı!' : 'Level up!', `${e.level}`, 1500);
      break;
    case 'playerRevive':
      ui.banner(ui.lang === 'tr' ? 'Kaldırıldı!' : 'Revived!', names[e.slot] ?? '', 1500);
      break;
    case 'gameOver':
      over = true;
      setTimeout(() => audio.stopMusic(), 4000);
      setTimeout(() => world && ui.showGameOver(world, recorder !== null), 1800);
      break;
    default:
      break;
  }
}

function setPaused(p: boolean): void {
  if (!world || over) return;
  if (mode !== 'solo') {
    ui.toggleSettings();
    return;
  }
  paused = p;
  input.enabled = !p;
  if (p) ui.showPause();
  else ui.clearScreen();
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') setPaused(!paused);
});
window.addEventListener('blur', () => {
  if (mode === 'solo' && world && !over && !paused && !dev.auto && !dev.perf) setPaused(true);
});

const _p = new THREE.Vector3();
/** Floating damage numbers for hits (thinned out when the screen is full of them). */
function damageNumber(x: number, y: number, damage: number): void {
  if (damage < 1) return;
  _p.set(x, 1.7, -y).project(stage.camera);
  const px = ((_p.x + 1) / 2) * app.clientWidth;
  const py = ((1 - _p.y) / 2) * app.clientHeight;
  if (px < 0 || py < 0 || px > app.clientWidth || py > app.clientHeight) return;
  ui.popNumber(px, py, String(Math.round(damage)), damage >= 25);
}

// ---- starting a game ----
function beginPlaying(w: World, slot: number): void {
  audio.startMusic();
  world = w;
  localSlot = slot;
  ui.clearScreen();
  input.enabled = true;
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!w.pActive[s]) continue;
    curX[s] = prevX[s] = w.pX[s]!;
    curY[s] = prevY[s] = w.pY[s]!;
    curA[s] = prevA[s] = w.pAngle[s]!;
    ensureCharacter(s);
  }
}

function startSolo(name: string): void {
  mode = 'solo';
  const players: { slot: number; weapon: WeaponId }[] = [{ slot: 0, weapon: startWeapon }];
  names = [name];
  for (let b = 1; b <= dev.bots; b++) {
    players.push({ slot: b, weapon: b % 2 ? 'smg' : 'ar' });
    names[b] = 'Bot ' + b;
  }
  const setup = { seed: (Math.random() * 0xffffffff) >>> 0, players };
  const w = createGame(setup);
  if (dev.wave > 1) setWave(w, dev.wave);
  // a replay of a game that started on a later wave cannot be reproduced from the setup alone
  if (dev.wave <= 1) recorder = new Recorder(setup);
  beginPlaying(w, 0);
}

function startPlayback(r: Replay): void {
  mode = 'solo';
  playback = r;
  names = r.setup.players.map((p) => 'P' + (p.slot + 1));
  beginPlaying(createGame(r.setup), r.setup.players[0]?.slot ?? 0);
}

function downloadReplay(): void {
  if (!recorder) return;
  const blob = new Blob([encodeReplay(recorder.replay) as BlobPart], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `white-room-horde-${Date.now()}.wrh`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Accept a pasted tunnel address in any form: https://host, wss://host or host/ws. */
function normalizeServer(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) s = s.replace(/^http/i, 'ws');
  else if (!/^wss?:\/\//i.test(s)) s = (location.protocol === 'https:' ? 'wss://' : 'ws://') + s;
  const u = new URL(s);
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  return u.toString();
}

function connect(name: string, rawServer: string, code: string | null): void {
  const server = normalizeServer(rawServer);
  if (!server) {
    ui.showMenu('Enter the server address first');
    return;
  }
  try {
    localStorage.setItem('wrh.server', server);
  } catch {
    /* ignore */
  }
  mode = 'online';
  ui.showConnecting();
  const sock = new WebSocket(server);
  sock.binaryType = 'arraybuffer';
  ws = sock;
  const sess = new NetSession({ send: (d) => sock.readyState === WebSocket.OPEN && sock.send(d) });
  session = sess;
  sock.onopen = () => (code ? sess.join(code, name, startWeapon) : sess.create(name, startWeapon));
  sock.onmessage = (ev) => sess.onMessage(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data as ArrayBuffer));
  sock.onclose = () => {
    if (!over) {
      mode = 'menu';
      session = null;
      world = null;
      ui.clearHud();
      ui.showMenu('Connection lost');
    }
  };
  sock.onerror = () => ui.showMenu('Could not connect to ' + server);
}

// ---- main loop ----
let acc = 0;
let last = performance.now();
let frames = 0, fpsT = 0, fps = 0;
let stepMs = 0, stepN = 0, frameMs = 0, frameN = 0;
const perf = { fps: 0, simMs: 0, frameMs: 0, calls: 0, triangles: 0, enemies: 0, corpses: 0, particles: 0 };
const dummy = new THREE.Object3D();
const q = new THREE.Quaternion();
const fwd = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();
let localInput: PlayerInput = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

function sampleLocal(): PlayerInput {
  if (dev.auto && mode === 'solo') return scriptedInput(world!.tick, 0);
  const s = input.sample(curX[localSlot]!, curY[localSlot]!);
  return s.input;
}

function frame(nowMs: number): void {
  const t0 = performance.now();
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  nowSec = nowMs / 1000;
  let alpha = 0;

  const sess0 = session;
  if (mode === 'online' && sess0 && session) {
    if (session.state === 'lobby') {
      const sig = session.code + JSON.stringify(session.players);
      if (sig !== lobbySig) {
        lobbySig = sig;
        names = [];
        for (const p of session.players) names[p.slot] = p.name;
        ui.showLobby(session.code, session.players, session.players.find((p) => p.slot === sess0.slot)?.host ?? false);
      }
    } else if (session.state === 'playing' && session.world && !world) {
      for (const p of session.players) names[p.slot] = p.name;
      beginPlaying(session.world, session.slot);
    }
    if (session.error && !world) {
      ui.showMenu(session.error);
      session.error = '';
      mode = 'menu';
    }
  }

  if (world && mode === 'solo' && paused) {
    acc = 0;
  } else if (world && mode === 'solo') {
    acc += dt;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      let inputs: (PlayerInput | undefined)[] = [];
      if (playback) {
        inputs = playback.ticks[world.tick] ?? [];
        if (world.tick >= playback.ticks.length) {
          acc = 0;
          break;
        }
      } else {
        for (let s = 0; s < MAX_PLAYERS; s++) {
          if (!world.pActive[s]) continue;
          inputs[s] = scriptedInput(world.tick, s);
        }
        localInput = sampleLocal();
        inputs[localSlot] = localInput;
      }
      if (dev.god && !playback) for (let s = 0; s < MAX_PLAYERS; s++) world.pHp[s] = world.pMaxHp[s]!;
      beforeStep(world);
      const s0 = performance.now();
      step(world, inputs);
      recorder?.record(world, inputs);
      stepMs += performance.now() - s0;
      stepN++;
      afterStep(world);
    }
    alpha = acc / TICK_DT;
  } else if (world && mode === 'online' && session) {
    acc += dt;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      session.sendInput(sampleLocal());
    }
    catchingUp = session.backlog > 20;
    const s0 = performance.now();
    const n = session.pump(session.backlog > 8 ? 4 : 2, { before: beforeStep, after: afterStep });
    if (n) {
      stepMs += performance.now() - s0;
      stepN += n;
    }
    catchingUp = false;
    alpha = Math.min(1, (performance.now() - lastStepAt) / (TICK_DT * 1000));
    for (let s = 0; s < MAX_PLAYERS; s++) if (world.pActive[s]) ensureCharacter(s);
    if (session.desyncTicks.length) ui.warn('Desync detected!');
  }

  if (world) {
    const w = world;
    // characters
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const c = chars[s];
      if (!c || !w.pActive[s]) continue;
      if (charWeapon[s] !== w.pWeapon[s]) {
        charWeapon[s] = w.pWeapon[s]!;
        c.detachWeapon();
        void c.attachWeapon('weapon_' + WEAPON_IDS[w.pWeapon[s]!]!);
      }
      const x = prevX[s]! + (curX[s]! - prevX[s]!) * alpha;
      const y = prevY[s]! + (curY[s]! - prevY[s]!) * alpha;
      const ang = lerpAngle(prevA[s]!, curA[s]!, alpha);
      c.root.position.set(x, 0, -y);
      c.root.rotation.y = ang + Math.PI / 2;
      const st = w.pState[s]!;
      if (st === PlayerState.Dead) c.playOnce('death');
      else if (st === PlayerState.Downed) c.play('down_idle');
      else c.play(pickPlayerClip({ moving: w.pMoving[s] === 1, firing: nowSec - lastShot[s]! < 0.2, moveAngle: moveAngle[s]!, facing: curA[s]! }));
      c.update(dt);
      if (st === PlayerState.Alive) c.applyAim(dir.set(Math.cos(ang), 0, -Math.sin(ang)));
    }
    // camera follows the local player, or a living teammate when down/dead
    let target = localSlot;
    if (w.pState[target] === PlayerState.Dead) {
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pState[s] === PlayerState.Alive) { target = s; break; }
    }
    const fx0 = prevX[target]! + (curX[target]! - prevX[target]!) * alpha;
    const fy0 = prevY[target]! + (curY[target]! - prevY[target]!) * alpha;
    stage.follow(fx0, -fy0, fx.shake);

    // name tags over the other players
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const show = s !== localSlot && !!w.pActive[s] && (mode === 'online' || dev.bots > 0) && w.pState[s] !== PlayerState.Dead;
      if (!show) {
        ui.setTag(s, '', '#000', 0, 0, false);
        continue;
      }
      _p.set(prevX[s]! + (curX[s]! - prevX[s]!) * alpha, 2.7, -(prevY[s]! + (curY[s]! - prevY[s]!) * alpha)).project(stage.camera);
      ui.setTag(s, names[s] ?? 'P' + (s + 1), PLAYER_COLORS[s % PLAYER_COLORS.length]!, ((_p.x + 1) / 2) * app.clientWidth, ((1 - _p.y) / 2) * app.clientHeight, true);
    }
    audio.setListener(fx0, fy0);
    audio.tick(w, localSlot, dt);
    crowd.update(w, alpha, nowSec);
    fx.update(dt);
    ragdolls.update(dt);
    pickups.update(w, nowSec);

    let n = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!w.bActive[i]) continue;
      dummy.position.set(w.bX[i]!, BALANCE.weapons[WEAPON_IDS[w.pWeapon[w.bOwner[i]!]!]!].muzzleH, -w.bY[i]!);
      q.setFromUnitVectors(fwd, dir.set(w.bVx[i]!, 0, -w.bVy[i]!).normalize());
      dummy.quaternion.copy(q);
      dummy.updateMatrix();
      bulletMesh.setMatrixAt(n++, dummy.matrix);
    }
    bulletMesh.count = n;
    bulletMesh.instanceMatrix.needsUpdate = true;
    let gn = 0;
    for (let i = 0; i < MAX_GRENADES; i++) {
      if (!w.gActive[i]) continue;
      const left = w.gFuse[i]! - BALANCE.grenade.fuse;
      const arc = left > 0 ? Math.sin((1 - left / BALANCE.grenade.flight) * Math.PI) * 1.4 : 0;
      dummy.position.set(w.gX[i]!, 0.3 + arc, -w.gY[i]!);
      dummy.quaternion.identity();
      dummy.scale.setScalar(left > 0 ? 1 : 1 + Math.sin(nowSec * 30) * 0.12);
      dummy.updateMatrix();
      grenadeMesh.setMatrixAt(gn++, dummy.matrix);
    }
    dummy.scale.setScalar(1);
    grenadeMesh.count = gn;
    grenadeMesh.instanceMatrix.needsUpdate = true;
    let sn = 0;
    for (let i = 0; i < MAX_SPIT; i++) {
      if (!w.sActive[i]) continue;
      dummy.position.set(w.sX[i]!, 1.0, -w.sY[i]!);
      dummy.updateMatrix();
      spitMesh.setMatrixAt(sn++, dummy.matrix);
    }
    spitMesh.count = sn;
    spitMesh.instanceMatrix.needsUpdate = true;
    ui.update(w, localSlot, fx.hurt, nowMs, names);
    ui.drawMinimap(w, localSlot, nowMs);
  } else {
    fx.update(dt);
    stage.follow(0, 0);
  }

  stage.render();
  frameMs += performance.now() - t0;
  frameN++;
  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(frames / fpsT);
    perf.fps = fps;
    perf.simMs = stepN ? stepMs / stepN : 0;
    perf.frameMs = frameN ? frameMs / frameN : 0;
    perf.calls = stage.renderer.info.render.calls;
    perf.triangles = stage.renderer.info.render.triangles;
    perf.enemies = world?.enemyCount ?? 0;
    perf.corpses = crowd.corpseCount;
    perf.particles = fx.particleCount;
    frames = 0; fpsT = 0; stepMs = 0; stepN = 0; frameMs = 0; frameN = 0;
    if (dev.perf) {
      ui.setDev(
        `${fps} fps &middot; frame ${perf.frameMs.toFixed(2)} ms &middot; sim ${perf.simMs.toFixed(2)} ms &middot; calls ${perf.calls} &middot; tris ${(perf.triangles / 1000).toFixed(0)}k<br>` +
          `enemies ${perf.enemies} &middot; corpses ${perf.corpses} &middot; particles ${perf.particles}` +
          ` &middot; ${backend}` +
          (world ? ` &middot; tick ${world.tick} &middot; hash ${hashWorld(world).toString(16)}` : '') +
          (session ? ` &middot; rtt ${Math.round(session.rttMs)} ms &middot; backlog ${session.backlog}` : ''),
      );
    }
  }
  requestAnimationFrame(frame);
}

const replayUrl = params.get('replay');
if (replayUrl) {
  void fetch(replayUrl)
    .then((r) => r.arrayBuffer())
    .then((b) => startPlayback(decodeReplay(new Uint8Array(b))));
}

// menu or direct start for dev/measurement links
const autoStart = !replayUrl && params.get('solo') === '1' || dev.bots > 0 || dev.auto || dev.god || dev.perf || dev.wave > 1 || params.has('weapon');
if (autoStart) startSolo('dev');
else if (!replayUrl) ui.showMenu();
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__wrh = {
  get world() {
    return world;
  },
  get session() {
    return session;
  },
  stage,
  crowd,
  fx,
  perf,
  ui,
  ragdolls,
  spawnBoss: () => (world ? spawnBoss(world) : -1),
  get ws() {
    return ws;
  },
};
