import * as THREE from 'three';
import { BALANCE, Buttons, MAX_BULLETS, MAX_PLAYERS, PLAYER_COLORS, PlayerState, TICK_DT, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { createGame, hashWorld, scriptedInput, setWave, step, type SimEvent, type World } from '@wrh/sim';
import { NetSession } from '@wrh/net';
import { Audio } from './audio';
import { pickPlayerClip } from './anim';
import { Input } from './input';
import { Character } from './render/character';
import { Crowd } from './render/crowd';
import { Fx } from './render/fx';
import { Stage } from './render/stage';
import { Ui, type Settings } from './ui';

const app = document.getElementById('app')!;
document.getElementById('hud')?.remove();
const params = new URLSearchParams(location.search);

// ---- settings (persisted) ----
function loadSettings(): Settings {
  const def: Settings = { volume: 0.6, shadows: 2, scale: 1, lang: navigator.language.startsWith('tr') ? 'tr' : 'en' };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem('wrh.settings') ?? '{}') as Partial<Settings>) };
  } catch {
    return def;
  }
}
let settings = loadSettings();

const stage = new Stage(app);
const audio = new Audio();
const input = new Input(stage.renderer.domElement, stage.camera);
const fx = new Fx();
stage.scene.add(fx.group);
const crowd = await Crowd.create(150);
stage.scene.add(crowd.group);

const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshBasicMaterial({ color: '#fff0a8' }), MAX_BULLETS);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
stage.scene.add(bulletMesh);

function applySettings(): void {
  audio.setVolume(settings.volume);
  stage.setShadowQuality(settings.shadows);
  stage.setScale(settings.scale);
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
const dev = {
  perf: params.get('perf') === '1',
  bots: Math.max(0, Math.min(10, Number(params.get('bots') ?? 0))),
  auto: params.get('auto') === '1',
  god: params.get('god') === '1',
  wave: Number(params.get('wave') ?? 1),
};
const weaponParam = (params.get('weapon') ?? 'weapon_pistol').replace('weapon_', '');
const startWeapon = (WEAPON_IDS as readonly string[]).includes(weaponParam) ? (weaponParam as WeaponId) : 'pistol';

const ui = new Ui(
  document.body,
  {
    onSolo: (name) => startSolo(name),
    onHost: (name, server) => connect(name, server, null),
    onJoin: (name, code, server) => connect(name, server, code),
    onStart: () => session?.start(),
    onLeave: () => location.reload(),
    onCard: (i) => input.queueButton([Buttons.Card1, Buttons.Card2, Buttons.Card3][i]!),
    onAgain: () => location.reload(),
    onSetting: (key, value) => {
      if (key === 'volume') settings = { ...settings, volume: value as number };
      else if (key === 'shadows') settings = { ...settings, shadows: value as 0 | 1 | 2 };
      else if (key === 'scale') settings = { ...settings, scale: value as number };
      else settings = { ...settings, lang: value as 'en' | 'tr' };
      applySettings();
    },
  },
  settings,
);
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
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
  if (!catchingUp) crowd.onEvents(w, w.events, nowSec);
  for (const e of w.events) handleEvent(e);
}

function handleEvent(e: SimEvent): void {
  if (e.type === 'shot') lastShot[e.slot] = nowSec;
  if (catchingUp) return;
  fx.onEvent(e, localSlot);
  audio.onEvent(e, localSlot);
  switch (e.type) {
    case 'enemyHit':
      crowd.hit(e.id);
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
      setTimeout(() => world && ui.showGameOver(world), 1800);
      break;
    default:
      break;
  }
}

// ---- starting a game ----
function beginPlaying(w: World, slot: number): void {
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
  const w = createGame({ seed: (Math.random() * 0xffffffff) >>> 0, players });
  if (dev.wave > 1) setWave(w, dev.wave);
  beginPlaying(w, 0);
}

function connect(name: string, server: string, code: string | null): void {
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

  if (world && mode === 'solo') {
    acc += dt;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      const inputs: PlayerInput[] = [];
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!world.pActive[s]) continue;
        inputs[s] = s === localSlot ? localInput : scriptedInput(world.tick, s);
      }
      localInput = sampleLocal();
      inputs[localSlot] = localInput;
      if (dev.god) for (let s = 0; s < MAX_PLAYERS; s++) world.pHp[s] = world.pMaxHp[s]!;
      beforeStep(world);
      const s0 = performance.now();
      step(world, inputs);
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

    crowd.update(w, alpha, nowSec);
    fx.update(dt);

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
    ui.update(w, localSlot, fx.hurt, nowMs, names);
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
          (world ? ` &middot; tick ${world.tick} &middot; hash ${hashWorld(world).toString(16)}` : '') +
          (session ? ` &middot; rtt ${Math.round(session.rttMs)} ms &middot; backlog ${session.backlog}` : ''),
      );
    }
  }
  requestAnimationFrame(frame);
}

// menu or direct start for dev/measurement links
const autoStart = params.get('solo') === '1' || dev.bots > 0 || dev.auto || dev.god || dev.perf || dev.wave > 1 || params.has('weapon');
if (autoStart) startSolo('dev');
else ui.showMenu();
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
  get ws() {
    return ws;
  },
};
