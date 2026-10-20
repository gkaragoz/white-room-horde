import * as THREE from 'three';
import { BALANCE, Buttons, CAMERA, PERK, PERKS, MAPS, ENEMY_TYPES, MAX_ENEMIES, MAX_BULLETS, MAX_GRENADES, MAX_SPIT, MAX_PLAYERS, PLAYER_COLORS, PlayerState, TICK_DT, WEAPON_IDS, type PlayerInput, type WeaponId } from '@wrh/shared';
import { createGame, decodeReplay, encodeReplay, hashWorld, Recorder, scriptedInput, setWave, spawnBoss, step, type Replay, type SimEvent, type World } from '@wrh/sim';
import { NetSession } from '@wrh/net';
import { Audio } from './audio';
import { Input, type Action } from './input';
import { ArenaView } from './render/arena';
import { Character } from './render/character';
import { PlayerAnimator } from './render/playerAnim';
import { Crowd } from './render/crowd';
import { PickupView, TIER_COLORS } from './render/pickups';
import { RagdollPool } from './render/ragdoll';
import { Fx } from './render/fx';
import { AmmoRing } from './render/ammoRing';
import { TargetMarker } from './render/targetMarker';
import { PropsView } from './render/props';
import { PowerView, strengthOf } from './render/power';
import { pickBackend } from './render/backend';
import { Stage } from './render/stage';
import { ACCESSORIES, clearRejoin, loadRejoin, recordGame, saveRejoin } from './profile';
import { BUILD, mountVersionBadge } from './buildinfo';
import { Ui, UI_STRINGS, type Settings } from './ui';
import { hideLoading, preloadAssets } from './preload';

const app = document.getElementById('app')!;
mountVersionBadge();
document.getElementById('hud')?.remove();
await preloadAssets();
const params = new URLSearchParams(location.search);

// ---- settings (persisted) ----
let worldReady = false;
function defaultSettings(): Settings {
  return { fpsCap: 0, texture: 1, autoScale: true, music: 0.5, renderer: 'webgl', aa: 'msaa', bounce: true, time: 'cycle', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0.6, shadows: 2, scale: 1, lang: ((['tr', 'de', 'es', 'fr', 'ru'] as const).find((l) => navigator.language.toLowerCase().startsWith(l)) ?? 'en') as Settings['lang'] };
}

function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem('wrh.settings') ?? '{}') as Partial<Settings>) };
  } catch {
    return def;
  }
}
let settings = loadSettings();
/** Render scale chosen by the auto-resolution controller (never above the setting). */
let autoScale = settings.scale;

const wantBackend = params.get('renderer') === 'webgpu' ? 'webgpu' : params.get('renderer') === 'webgl' ? 'webgl' : settings.renderer;
const backend = await pickBackend(wantBackend);
async function createStage(): Promise<Stage> {
  try {
    return await Stage.create(app, { aa: settings.aa, bounce: settings.bounce, backend, texture: settings.texture });
  } catch (e) {
    // no usable graphics context (old or locked-down browser, graphics acceleration off): say so instead of a blank page
    const tr = navigator.language.startsWith('tr');
    const box = document.createElement('div');
    box.id = 'wrh-nogl';
    box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#3a352d;text-align:center;padding:24px';
    box.innerHTML = `<div style="max-width:460px"><h2>white-room-horde</h2><p>${
      tr
        ? 'Tarayıcın WebGL çizim bağlamı oluşturamadı. Donanım hızlandırmayı açmayı, tarayıcıyı güncellemeyi veya Chrome, Edge ya da Firefox ile denemeyi dene.'
        : 'Your browser could not create a WebGL graphics context. Try turning on hardware acceleration, updating the browser, or using Chrome, Edge or Firefox.'
    }</p></div>`;
    document.body.appendChild(box);
    hideLoading();

// offline cache: models, sounds and card art are kept after the first visit (production builds on https or localhost only)
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(`${BUILD.version}-${BUILD.commit}`)}`).catch(() => undefined);
  });
}
    throw e;
  }
}
const stage = await createStage();
const audio = new Audio();
const input = new Input(stage.renderer.domElement, stage.camera);
const fx = new Fx(undefined, settings.texture);
const power = new PowerView((x, y, h, color, n, speed) => fx.sparkle(x, y, h, color, n, speed));
fx.light = (x, y, z, color, intensity, life, distance) => stage.glow(x, y, z, color, intensity, life, distance);
fx.powerFor = (slot) => {
  if (!world) return 0;
  const st = strengthOf(world, slot);
  return st.damage + st.rate * 0.7;
};
stage.scene.add(fx.group);
stage.camera.updateMatrixWorld(true);
fx.faceCamera(stage.camera.quaternion);
const crowd = await Crowd.create(150, backend);
stage.scene.add(crowd.group);
const ragdolls = await RagdollPool.create(40);
await ragdolls.preload([...ENEMY_TYPES]);
worldReady = true;
crowd.corpseLife = [2.5, 5, 14][settings.corpseTime]!;
ragdolls.restLife = [1.2, 3.2, 10][settings.corpseTime]!;
stage.scene.add(ragdolls.group);
const pickups = new PickupView();
stage.scene.add(pickups.group);
void pickups.load();
void pickups.loadWeapons();

const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_BULLETS);
// a soft additive halo around every round so it reads at any distance and glows at night
const bulletGlow = new THREE.InstancedMesh(
  new THREE.CapsuleGeometry(0.07, 0.7, 3, 8).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  MAX_BULLETS,
);
bulletGlow.frustumCulled = false;
bulletGlow.count = 0;
bulletMesh.frustumCulled = false;
/** Look of each weapon's rounds: colour and size of the tracer (width, length multipliers). */
const TRACER: Record<WeaponId, { color: THREE.Color; w: number; l: number }> = {
  pistol: { color: new THREE.Color('#fff0a8'), w: 1, l: 1 },
  smg: { color: new THREE.Color('#ffe58a'), w: 0.8, l: 0.8 },
  ar: { color: new THREE.Color('#ffd86a'), w: 1, l: 1.1 },
  shotgun: { color: new THREE.Color('#ffc65a'), w: 0.9, l: 0.45 },
  hmg: { color: new THREE.Color('#ffb347'), w: 1.4, l: 1.3 },
  minigun: { color: new THREE.Color('#ff9f3a'), w: 1.1, l: 1.4 },
  sniper: { color: new THREE.Color('#d6f1ff'), w: 1, l: 2.6 },
  revolver: { color: new THREE.Color('#ffd27a'), w: 1.5, l: 1.1 },
  mp: { color: new THREE.Color('#fff2b0'), w: 0.75, l: 0.8 },
  dbl: { color: new THREE.Color('#ffb13a'), w: 0.9, l: 0.45 },
  dmr: { color: new THREE.Color('#bfe9ff'), w: 1, l: 1.9 },
  flamer: { color: new THREE.Color('#ff7a1a'), w: 2.6, l: 0.6 },
  gl: { color: new THREE.Color('#9fe870'), w: 2.4, l: 0.9 },
};
const tracerScale = new THREE.Vector3();
const GLOW_SCALE = new THREE.Vector3(1.9, 1.9, 1.25);
const tracerColor = new THREE.Color();
const HOT = new THREE.Color('#ff3a2a');
const COOL = new THREE.Color('#35d6ff');
const strength: (ReturnType<typeof strengthOf> | undefined)[] = [];
bulletMesh.count = 0;
stage.scene.add(bulletMesh);
stage.scene.add(bulletGlow);
stage.scene.add(power.group);
const ammoRing = new AmmoRing();
stage.scene.add(ammoRing.group);
const targetMarker = new TargetMarker();
stage.scene.add(targetMarker.group);

// cover boxes of the current layout (rebuilt per game)
const arena = new ArenaView();
const props = await PropsView.create();
stage.scene.add(props.group);
stage.scene.add(arena.group);
const animator = new PlayerAnimator();

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
  stage.setScale(settings.autoScale ? Math.min(autoScale, settings.scale) : settings.scale);
  stage.setBounce(settings.bounce);
  stage.setDynamicLights(settings.dynLights);
  fx.density = [0.5, 1, 1.6][settings.particles]!;
  fx.gore = [0.4, 1, 1.8][settings.gore]!;
  audio.sfxVolume = settings.sfxVolume;
  audio.voiceVolume = settings.voiceVolume;
  audio.uiSounds = settings.uiSounds;
  if (worldReady) {
    crowd.corpseLife = [2.5, 5, 14][settings.corpseTime]!;
    ragdolls.restLife = [1.2, 3.2, 10][settings.corpseTime]!;
  }
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
    onHost: (name, server, password) => connect(name, server, null, password),
    onJoin: (name, code, server, password) => connect(name, server, code, password),
    onRejoin: () => {
      const r = loadRejoin();
      if (r) connect(ui.name(), r.server, r.code, '', r.token);
    },
    onLook: (acc, color, cls) => session?.setLook(acc, color, cls),
    getBindings: () => input.bindings,
    onRebind: (action, done) =>
      input.captureKey(action as Action, (code) => {
        if (code) input.setBinding(action as Action, code);
        done();
      }),
    onResetKeys: () => input.resetBindings(),
    onOptions: (map, difficulty) => session?.setOptions(map, difficulty),
    onWeapon: (wp) => {
      startWeapon = wp;
      session?.setWeapon(wp);
    },
    onStart: () => session?.start(),
    onLeave: () => location.reload(),
    onCard: (i) => input.queueButton([Buttons.Card1, Buttons.Card2, Buttons.Card3][i]!),
    onAgain: () => location.reload(),
    onUiSound: (n) => {
      if (settings.uiSounds) audio.ui(n);
    },
    onResume: () => setPaused(false),
    onReplay: () => downloadReplay(),
    onResetSettings: () => {
      settings = { ...defaultSettings(), lang: settings.lang };
      autoScale = settings.scale;
      applySettings();
    },
    onSetting: (key, value) => {
      if (key === 'volume') settings = { ...settings, volume: value as number };
      else if (key === 'music') settings = { ...settings, music: value as number };
      else if (key === 'shadows') settings = { ...settings, shadows: value as 0 | 1 | 2 };
      else if (key === 'scale') {
        settings = { ...settings, scale: value as number };
        autoScale = settings.scale;
      }
      else if (key === 'renderer') {
        settings = { ...settings, renderer: value as Settings['renderer'] };
        applySettings();
        location.reload();
        return;
      } else if (key === 'texture') {
        settings = { ...settings, texture: value as 0 | 1 };
        applySettings();
        location.reload();
        return;
      } else if (key === 'fpsCap') settings = { ...settings, fpsCap: value as Settings['fpsCap'] };
      else if (key === 'autoScale') {
        settings = { ...settings, autoScale: value as boolean };
        autoScale = settings.scale;
        stage.setScale(settings.scale);
      } else if (key === 'bounce') settings = { ...settings, bounce: value as boolean };
      else if (key === 'time') settings = { ...settings, time: value as Settings['time'] };
      else if (key === 'dynLights') settings = { ...settings, dynLights: value as boolean };
      else if (key === 'weather') settings = { ...settings, weather: value as boolean };
      else if (key === 'aa') {
        settings = { ...settings, aa: value as Settings['aa'] };
        applySettings();
        location.reload();
        return;
      }
      else if (key === 'colorblind') settings = { ...settings, colorblind: value as boolean };
      else if (key === 'textSize') settings = { ...settings, textSize: value as 0 | 1 | 2 };
      else settings = { ...settings, [key]: value } as Settings;
      applySettings();
    },
  },
  settings,
);
audio.setWeaponLookup((s) => (world && world.pActive[s] ? WEAPON_IDS[world.pWeapon[s]!] : undefined));
audio.setSlotLookup((s) => (world && world.pActive[s] ? { x: world.pX[s]!, y: world.pY[s]! } : undefined));
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
ui.weapon = startWeapon;
applySettings();

// ---- characters ----
const chars: (Character | null)[] = new Array<Character | null>(MAX_PLAYERS).fill(null);
const charWeapon = new Int32Array(MAX_PLAYERS).fill(-1);
const loading = new Set<number>();
/** Accessory index of a slot: the lobby choice online, the profile for the local player, otherwise by slot. */
function accFor(s: number): number {
  if (session) return session.players.find((p) => p.slot === s)?.acc ?? s;
  return s === localSlot ? ui.acc : s;
}

/** Vest colour of a slot: the lobby choice online, the profile colour for the local player, otherwise by slot. */
function colorFor(s: number): string {
  const idx = session ? (session.players.find((p) => p.slot === s)?.color ?? -1) : s === localSlot ? ui.color : -1;
  const i = (idx >= 0 ? idx : s) % PLAYER_COLORS.length;
  return (settings.colorblind ? COLORBLIND_COLORS : PLAYER_COLORS)[i]!;
}
/** Okabe-Ito based, readable with the common kinds of colour blindness. */
const COLORBLIND_COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#999999', '#882255', '#44AA99', '#117733'] as const;
ui.slotColor = colorFor;

/** How dark it should be: the setting, or in the day and night cycle four waves of day followed by four of night. */
function nightFor(w: World): number {
  if (settings.time === 'night') return 1;
  if (settings.time === 'day') return 0;
  return (w.wave - 1) % 8 >= 4 ? 1 : 0;
}

function ensureCharacter(s: number): void {
  if (chars[s] || loading.has(s) || !world) return;
  loading.add(s);
  const wid = WEAPON_IDS[world.pWeapon[s]!]!;
  void Character.createPlayer({
    color: colorFor(s),
    accessory: params.get('acc') && s === localSlot ? params.get('acc')! : ACCESSORIES[accFor(s) % ACCESSORIES.length]!,
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
let nowSec = 0;
const lastDust: number[] = new Array<number>(MAX_PLAYERS).fill(0);
let catchingUp = false;
let catchupPeak = 0;
let joinedLate = false;
let reconnecting = false;

function beforeStep(w: World): void {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    prevX[s] = curX[s]!;
    prevY[s] = curY[s]!;
    prevA[s] = curA[s]!;
  }
  crowd.snapshot(w);
}

function afterStep(w: World): void {
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
  // chaos: nearly every kill throws a physical body, and a blast near the corpse launches it high and far
  if (!(e.power >= BALANCE.progression.ragdollPower || Math.random() < 0.8)) return false;
  let boost = 1;
  for (const ev of w.events) {
    if (ev.type !== 'explosion') continue;
    const reach = ev.radius * 2.2;
    const d = Math.hypot(e.x - ev.x, e.y - ev.y);
    if (d < reach) boost = Math.max(boost, 1 + 3 * (1 - d / reach));
  }
  const info = crowd.deathInfo(w, e.id);
  // sim (x, y) -> three (x, z = -y)
  return ragdolls.spawn(type, e.x, -e.y, info.yaw, info.clip, info.time, { x: info.vx * 0.5, z: -info.vy * 0.5 }, { x: e.dx, z: -e.dy, power: e.power * boost + (boost > 1 ? 40 : 0) });
}

function handleEvent(e: SimEvent): void {
  if (e.type === 'shot') {
    lastShot[e.slot] = nowSec;
    if (e.slot === localSlot) cursorPulse();
    // recoil: the weapon kicks back by an amount that grows with the round's punch
    const st = BALANCE.weapons[WEAPON_IDS[e.weapon]!];
    chars[e.slot]?.kick(Math.min(0.32, 0.05 + st.damage * st.pellets * 0.0016));
  }
  if (e.type === 'playerHit' && e.slot === localSlot && world) {
    // which way did it come from: the nearest enemy
    let best = -1;
    let bd = 25;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!world.eActive[i]) continue;
      const d = (world.eX[i]! - e.x) ** 2 + (world.eY[i]! - e.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      _p.set(e.x, 0.5, -e.y).project(stage.camera);
      const px = _p.x;
      const py = _p.y;
      _p.set(world.eX[best]!, 0.5, -world.eY[best]!).project(stage.camera);
      ui.hurtFrom(Math.atan2(-(_p.y - py), _p.x - px));
    }
  }
  if (e.type === 'weaponSwitch' && e.slot === localSlot && e.auto) {
    const L = UI_STRINGS[ui.lang];
    const n = (L.weapons as Record<string, string>)[WEAPON_IDS[e.weapon]!];
    ui.warn(`${e.weapon === 0 ? L.switched : L.backToMain} ${n}`);
  }
  if (catchingUp) return;
  fx.onEvent(e, localSlot);
  audio.onEvent(e, localSlot);
  switch (e.type) {
    case 'enemyHit':
      crowd.hit(e.id);
      if (Math.random() < 0.6) damageNumber(e.x, e.y, e.damage);
      break;
    case 'waveStart': {
      const L = UI_STRINGS[ui.lang];
      const mod = e.mod ?? 0;
      ui.banner(e.boss ? (ui.lang === 'tr' ? 'BOSS GELİYOR!' : 'BOSS INCOMING!') : `${ui.lang === 'tr' ? 'Dalga' : 'Wave'} ${e.wave}`, mod ? `${L.waveMods[mod]} ${L.waveModTips[mod]}` : '', e.boss ? 3500 : mod ? 2600 : 1800);
      break;
    }
    case 'waveCleared':
      ui.banner(UI_STRINGS[ui.lang].waveCleared, UI_STRINGS[ui.lang].breather, 1800);
      break;
    case 'secondWind':
      ui.banner(UI_STRINGS[ui.lang].secondWind, names[e.slot] ?? '', 1600);
      break;
    case 'pickup':
      if (e.slot === localSlot && e.kind >= 4) ui.banner(UI_STRINGS[ui.lang].powerups[e.kind]!, '', e.kind === 7 ? 1800 : 1300);
      if (e.kind === 7) ui.screenFlash('#ffffff', 700);
      break;
    case 'nuke':
      slowMo(0.7);
      ui.screenFlash('#fff6c8', 900);
      break;
    case 'freeze':
      ui.screenFlash('#9be8ff', 800);
      break;
    case 'enemyDeath': {
      // the kill you just made lands with a tiny freeze; heavy rounds freeze a little longer; bosses go to slow motion
      if (nowSec - lastShot[localSlot]! < 0.25) hitStop(e.power >= 60 ? 0.06 : e.power >= 25 ? 0.04 : 0.02);
      if (world && world.eBoss[e.id]) slowMo(0.9);
      if (nowSec - comboAt > 2.2) comboCount = 0;
      comboCount++;
      comboAt = nowSec;
      const step = COMBO_STEPS.indexOf(comboCount);
      if (step >= 0 && settings.announcer) {
        ui.banner(UI_STRINGS[ui.lang].combos[step]!, `x${comboCount}`, 1100);
        audio.play('level');
      }
      break;
    }
    case 'levelUp':
      ui.banner(ui.lang === 'tr' ? 'Seviye atlandı!' : 'Level up!', `${e.level}`, 1500);
      break;
    case 'playerRevive':
      ui.banner(ui.lang === 'tr' ? 'Kaldırıldı!' : 'Revived!', names[e.slot] ?? '', 1500);
      animator.trigger(e.slot, 'get_up', 1.3, nowSec);
      break;
    case 'grenadeThrown':
      animator.trigger(e.owner, world && world.pMoving[e.owner] ? 'throw_run' : 'throw', 0.85, nowSec);
      break;
    case 'playerDown':
      animator.trigger(e.slot, 'hit_down', 1.2, nowSec);
      break;
    case 'bossAbility':
      ui.banner(e.kind === 'charge' ? (ui.lang === 'tr' ? 'HÜCUM!' : 'CHARGE!') : e.kind === 'aura' ? (ui.lang === 'tr' ? 'Sürü hızlandı!' : 'The swarm speeds up!') : (ui.lang === 'tr' ? 'Takviye çağırdı!' : 'Reinforcements!'), '', 1400);
      break;
    case 'gameOver':
      over = true;
      setTimeout(() => audio.stopMusic(), 4000);
      {
        const rec = world && !playback ? recordGame(world.wave, world.kills) : undefined;
        clearRejoin();
        ui.playerNames = names;
        setTimeout(() => world && ui.showGameOver(world, recorder !== null, rec), 1800);
      }
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
  if (input.bindings.pause.includes(e.code) && (e.target as HTMLElement).tagName !== 'INPUT') setPaused(!paused);
});
window.addEventListener('blur', () => {
  if (mode === 'solo' && world && !over && !paused && !dev.auto && !dev.perf) setPaused(true);
});

const _p = new THREE.Vector3();
/** Floating damage numbers for hits (thinned out when the screen is full of them). */
function damageNumber(x: number, y: number, damage: number): void {
  if (damage < 1 || !settings.damageNumbers) return;
  _p.set(x, 1.7, -y).project(stage.camera);
  const px = ((_p.x + 1) / 2) * app.clientWidth;
  const py = ((1 - _p.y) / 2) * app.clientHeight;
  if (px < 0 || py < 0 || px > app.clientWidth || py > app.clientHeight) return;
  ui.popNumber(px, py, String(Math.round(damage)), damage >= 25);
}

// ---- hit feel: a short freeze on heavy kills, slow motion on big moments ----
let stopT = 0;
let slowT = 0;
/** 1 normally; tiny during a hit-stop, 0.35 in slow motion. Solo games slow the simulation too, online only the visuals. */
let timeScale = 1;
function hitStop(seconds: number): void {
  if (!settings.hitStop) return;
  if (seconds > stopT) stopT = seconds;
}
function slowMo(seconds: number): void {
  if (seconds > slowT) slowT = seconds;
}

// ---- cursor: the system pointer is hidden over the game and a soft ring takes its place ----
const cursorEl = document.createElement('div');
cursorEl.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;box-sizing:border-box;border:5px solid rgba(0,0,0,.42);border-radius:50%;background:rgba(0,0,0,.07);pointer-events:none;z-index:60;display:none;will-change:transform';
document.body.appendChild(cursorEl);
let cursorOnCanvas = false;
let cursorTouch = false;
window.addEventListener('pointermove', (e) => {
  cursorTouch = e.pointerType === 'touch';
  cursorEl.style.left = `${e.clientX}px`;
  cursorEl.style.top = `${e.clientY}px`;
  cursorOnCanvas = e.target === stage.renderer.domElement;
});
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' && e.target === stage.renderer.domElement) cursorPulse();
});
/** The ring swells and settles again with an ease-out-back overshoot; it fires on every shot and click. */
function cursorPulse(): void {
  cursorEl.animate(
    [
      { transform: 'scale(1)', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { transform: 'scale(1.38)', offset: 0.35, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { transform: 'scale(1)' },
    ],
    { duration: 240 },
  );
}
function updateCursor(): void {
  const playing = !!world && !over && !paused && mode !== 'menu' && !ui.overlayOpen;
  const show = playing && cursorOnCanvas && !cursorTouch;
  cursorEl.style.display = show ? 'block' : 'none';
  stage.renderer.domElement.style.cursor = playing && !cursorTouch ? 'none' : '';
}

// ---- kill streaks ----
let comboCount = 0;
let comboAt = -10;
const COMBO_STEPS = [10, 25, 50, 100, 200, 350];

// ---- starting a game ----
function beginPlaying(w: World, slot: number): void {
  audio.startMusic();
  arena.setMap(w.map);
  props.setMap(w.map);
  fx.setMap(w.map);
  stage.setLamps(props.lamps);
  stage.setNightNow(nightFor(w));
  stage.update(0, 0, 0);
  props.setNight(stage.night);
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
  const players: { slot: number; weapon: WeaponId; cls: number }[] = [{ slot: 0, weapon: startWeapon, cls: ui.cls }];
  names = [name];
  for (let b = 1; b <= dev.bots; b++) {
    players.push({ slot: b, weapon: b % 2 ? 'smg' : 'ar', cls: b % 7 });
    names[b] = 'Bot ' + b;
  }
  const map = params.has('map') ? Number(params.get('map')) : ui.map >= 0 ? ui.map : Math.floor(Math.random() * MAPS.length);
  const setup = { seed: (Math.random() * 0xffffffff) >>> 0, players, map, difficulty: params.has('difficulty') ? Number(params.get('difficulty')) : ui.difficulty };
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

let reconnectTries = 0;

/**
 * Open an online session: host (code null), join with a code, or rejoin a slot with its token. When the socket drops in
 * the middle of a game the page keeps the frozen world on screen and reattaches to the same slot a few times.
 */
function connect(name: string, rawServer: string, code: string | null, password = '', rejoinToken = ''): void {
  const server = normalizeServer(rawServer);
  if (!server) {
    ui.showMenu(ui.tr('noServer'));
    return;
  }
  try {
    localStorage.setItem('wrh.server', server);
  } catch {
    /* ignore */
  }
  mode = 'online';
  if (!world) ui.showConnecting();
  const sock = new WebSocket(server);
  sock.binaryType = 'arraybuffer';
  ws = sock;
  const sess = new NetSession({ send: (d) => sock.readyState === WebSocket.OPEN && sock.send(d) });
  session = sess;
  sock.onopen = () => {
    reconnectTries = 0;
    if (code) joinedLate = true;
    if (rejoinToken && code) sess.rejoin(code, rejoinToken);
    else if (code) sess.join(code, name, startWeapon, { password, acc: ui.acc, color: ui.color, cls: ui.cls });
    else sess.create(name, startWeapon, { password, acc: ui.acc, color: ui.color, cls: ui.cls });
  };
  sock.onmessage = (ev) => {
    sess.onMessage(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data as ArrayBuffer));
    if (sess.token && sess.code) saveRejoin({ server, code: sess.code, token: sess.token });
  };
  sock.onclose = () => {
    if (over || session !== sess) return;
    if (world && sess.token && reconnectTries < 6) {
      reconnectTries++;
      reconnecting = true;
      setTimeout(() => connect(name, server, sess.code, '', sess.token), 800 * reconnectTries);
      return;
    }
    mode = 'menu';
    session = null;
    world = null;
    ui.clearHud();
    ui.showMenu(ui.tr('connLost'));
  };
  sock.onerror = () => {
    if (!world) ui.showMenu(`${ui.tr('noConnect')} ${server}`);
  };
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
  if (world) input.switchTarget = world.pSel[localSlot] === 0 ? 1 : 0;
  const s = input.sample(curX[localSlot]!, curY[localSlot]!);
  return s.input;
}

let lastDrawn = 0;
let slowSeconds = 0;
let fastSeconds = 0;

/** Dynamic resolution: shed pixels when the frame rate sags, win them back when there is headroom. */
function adaptScale(currentFps: number, seconds: number): void {
  if (!settings.autoScale || !world) return;
  const target = settings.fpsCap || 60;
  if (currentFps < target * 0.8) {
    slowSeconds += seconds;
    fastSeconds = 0;
  } else if (currentFps > target * 0.95) {
    fastSeconds += seconds;
    slowSeconds = 0;
  }
  if (slowSeconds >= 1.5 && autoScale > 0.55) {
    autoScale = Math.max(0.55, autoScale - 0.1);
    stage.setScale(autoScale);
    if (autoScale <= 0.65) crowd.setShadows(false); // last resort for slow machines: the horde stops casting shadows
    slowSeconds = 0;
  } else if (fastSeconds >= 6 && autoScale < settings.scale) {
    autoScale = Math.min(settings.scale, autoScale + 0.05);
    stage.setScale(autoScale);
    if (autoScale >= 0.8) crowd.setShadows(true);
    fastSeconds = 0;
  }
}

function frame(nowMs: number): void {
  if (settings.fpsCap > 0 && nowMs - lastDrawn < 1000 / settings.fpsCap - 1.5) {
    requestAnimationFrame(frame);
    return;
  }
  lastDrawn = nowMs;
  const t0 = performance.now();
  if (input.consumePause()) setPaused(!paused);
  if (input.consumeHostPause()) {
    if (mode === 'online' && session && session.state === 'playing') {
      if (session.players.find((p) => p.slot === session!.slot)?.host) session.setPause(!session.paused);
    } else if (mode === 'solo') setPaused(!paused);
  }
  ui.setHostPause(mode === 'online' && !!session?.paused, !!session?.players.find((p) => p.slot === session!.slot)?.host);
  const realDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  stopT = Math.max(0, stopT - realDt);
  slowT = Math.max(0, slowT - realDt);
  timeScale = stopT > 0 ? 0.04 : slowT > 0 ? 0.35 : 1;
  const dt = realDt * timeScale;
  nowSec = nowMs / 1000;
  let alpha = 0;

  const sess0 = session;
  if (mode === 'online' && sess0 && session) {
    if (session.state === 'lobby') {
      const sig = session.code + JSON.stringify(session.players) + JSON.stringify(session.options);
      if (sig !== lobbySig) {
        lobbySig = sig;
        names = [];
        for (const p of session.players) names[p.slot] = p.name;
        ui.showLobby(session.code, session.players, session.players.find((p) => p.slot === sess0.slot)?.host ?? false, session.options, session.locked);
      }
    } else if (session.state === 'playing' && session.world && session.world !== world) {
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
    acc += dt; // already scaled: a hit-stop freezes the solo simulation
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
    acc += realDt; // inputs keep their 30 Hz cadence whatever the hit-stop does to the picture
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      session.sendInput(sampleLocal());
    }
    catchingUp = session.catchingUp || session.backlog > 20;
    const s0 = performance.now();
    const n = session.drive(realDt, { before: beforeStep, after: afterStep });
    if (n) {
      stepMs += performance.now() - s0;
      stepN += n;
    }
    // far behind the server (late join, a tab that was in the background): say so instead of looking frozen
    const behind = session.backlog;
    if (session.catchingUp) {
      catchupPeak = Math.max(catchupPeak, behind);
      ui.setLoading(ui.tr(joinedLate ? 'joining' : 'syncing'), 1 - behind / Math.max(1, catchupPeak));
    } else {
      catchupPeak = 0;
      joinedLate = false;
      ui.setLoading(reconnecting ? ui.tr('reconnecting') : null);
    }
    if (n && !session.catchingUp) reconnecting = false;
    catchingUp = false;
    alpha = session.catchingUp ? 0 : session.playFraction;
    for (let s = 0; s < MAX_PLAYERS; s++) if (world.pActive[s]) ensureCharacter(s);
    if (session.desyncTicks.length) ui.warn(ui.tr('desync'));
  }

  if (world) {
    const w = world;
    // characters
    props.syncBarrels(w, nowSec);
    power.begin();
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
      const cls = w.pPerk[s * PERKS + PERK.Class]!;
      c.root.scale.setScalar(PowerView.bodyScale(w, s) * (cls === 2 ? 1.18 : cls === 3 ? 0.92 : 1));
      power.slot(w, s, x, y, nowSec, dt, s === localSlot);
      if (w.pState[s] === PlayerState.Alive && nowSec - lastDust[s]! > 0.1) {
        const sp = Math.hypot(curX[s]! - prevX[s]!, curY[s]! - prevY[s]!) / TICK_DT;
        if (sp > 7) {
          lastDust[s] = nowSec;
          fx.dust(x, y);
        }
      }
      const aimDriven = animator.apply(w, s, c, nowSec, { firing: nowSec - lastShot[s]! < 0.2, moveAngle: moveAngle[s]!, facing: curA[s]! });
      c.update(dt);
      if (aimDriven) c.applyAim(dir.set(Math.cos(ang), 0, -Math.sin(ang)));
    }
    power.end();
    // camera follows the local player, or a living teammate when down/dead
    let target = localSlot;
    if (w.pState[target] === PlayerState.Dead) {
      for (let s = 0; s < MAX_PLAYERS; s++) if (w.pActive[s] && w.pState[s] === PlayerState.Alive) { target = s; break; }
    }
    const fx0 = prevX[target]! + (curX[target]! - prevX[target]!) * alpha;
    const fy0 = prevY[target]! + (curY[target]! - prevY[target]!) * alpha;
    stage.follow(fx0, -fy0, fx.shake * settings.shake);
    fx.faceCamera(stage.camera.quaternion);
    // time of day, real-time lights and the flashlight of the local player
    stage.nightTarget = nightFor(w);
    stage.setRain(settings.weather && stage.nightTarget > 0.5 && w.wave % 2 === 1);
    audio.nightBias = stage.night * 0.15;
    stage.update(dt, fx0, -fy0);
    props.setNight(stage.night);
    ui.setNightHud(stage.night > 0.5);
    ui.setCombo(settings.announcer && nowSec - comboAt < 2.2 ? comboCount : 0, '');
    {
      const me = localSlot;
      const lx = prevX[me]! + (curX[me]! - prevX[me]!) * alpha;
      const ly = prevY[me]! + (curY[me]! - prevY[me]!) * alpha;
      const a = lerpAngle(prevA[me]!, curA[me]!, alpha);
      stage.setFlashlight(lx, -ly, Math.cos(a), -Math.sin(a), w.pActive[me] === 1 && w.pState[me] === PlayerState.Alive);
      // ammo ring around the feet: green full, red empty, rounds left beside it
      const alive = w.pActive[me] === 1 && w.pState[me] === PlayerState.Alive;
      const st = BALANCE.weapons[WEAPON_IDS[w.pWeapon[me]!]!];
      const reloading = w.pReload[me]! > 0;
      _p.set(lx, 0.02, -ly).project(stage.camera);
      const ppu = app.clientWidth / CAMERA.orthoWidth;
      const frac = reloading ? 1 - w.pReload[me]! / (st.reload * w.modReload) : w.pMag[me]! / st.mag;
      // where the next grenade lands
      {
        const gc = BALANCE.grenade;
        const dist = input.grenadeDistance(lx, ly, gc.range, gc.minRange, gc.maxRange);
        const bm = w.modBlast * w.pPerk[me * PERKS + PERK.Blast]!;
        targetMarker.update(lx + Math.cos(a) * dist, -(ly + Math.sin(a) * dist), gc.radius * bm, nowSec, alive && !w.gameOver && w.pGren[me]! > 0 && !paused, (input.sample as unknown) !== undefined && w.pGrenCd[me]! > 0);
      }
      const show = alive && !w.gameOver && settings.ammoRing;
      ammoRing.update(lx, -ly, frac, reloading, nowSec, show);
      ui.setAmmoRing(((_p.x + 1) / 2) * app.clientWidth, ((1 - _p.y) / 2) * app.clientHeight, ppu * 2.1, frac, reloading ? '...' : `${w.pMag[me]}/${st.mag}`, show, reloading);
    }

    // name tags over the other players
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const show = s !== localSlot && !!w.pActive[s] && (mode === 'online' || dev.bots > 0) && w.pState[s] !== PlayerState.Dead;
      if (!show) {
        ui.setTag(s, '', '#000', 0, 0, false);
        continue;
      }
      _p.set(prevX[s]! + (curX[s]! - prevX[s]!) * alpha, 2.7, -(prevY[s]! + (curY[s]! - prevY[s]!) * alpha)).project(stage.camera);
      ui.setTag(s, (settings.colorblind ? `${s + 1} ` : '') + (names[s] ?? 'P' + (s + 1)), colorFor(s), ((_p.x + 1) / 2) * app.clientWidth, ((1 - _p.y) / 2) * app.clientHeight, true);
    }
    // revive rings over downed players (red: bleeding out, green: being revived)
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const down = !!w.pActive[s] && w.pState[s] === PlayerState.Downed && !w.gameOver;
      if (!down) {
        ui.setRing(s, 0, 0, 0, 0, false, false);
        continue;
      }
      _p.set(prevX[s]! + (curX[s]! - prevX[s]!) * alpha, 1.6, -(prevY[s]! + (curY[s]! - prevY[s]!) * alpha)).project(stage.camera);
      const need = BALANCE.player.reviveSeconds * w.modRevive;
      ui.setRing(s, Math.max(0, w.pTimer[s]! / BALANCE.player.downedSeconds), Math.min(1, w.pRevive[s]! / need), ((_p.x + 1) / 2) * app.clientWidth, ((1 - _p.y) / 2) * app.clientHeight, true, w.pRevive[s]! > 0);
    }
    // arrows at the screen edge for teammates who are out of view
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const far = s !== localSlot && !!w.pActive[s] && w.pState[s] !== PlayerState.Dead && (mode === 'online' || dev.bots > 0);
      if (!far) {
        ui.setArrow(s, '', '#000', 0, 0, 0, false);
        continue;
      }
      _p.set(prevX[s]! + (curX[s]! - prevX[s]!) * alpha, 1.0, -(prevY[s]! + (curY[s]! - prevY[s]!) * alpha)).project(stage.camera);
      const out = Math.abs(_p.x) > 0.96 || Math.abs(_p.y) > 0.94;
      if (!out) {
        ui.setArrow(s, '', '#000', 0, 0, 0, false);
        continue;
      }
      // the point where the line from the screen centre to the teammate leaves the screen
      const k = Math.max(Math.abs(_p.x) / 0.9, Math.abs(_p.y) / 0.86);
      const ex = _p.x / k;
      const ey = _p.y / k;
      ui.setArrow(s, names[s] ?? 'P' + (s + 1), colorFor(s), ((ex + 1) / 2) * app.clientWidth, ((1 - ey) / 2) * app.clientHeight, Math.atan2(-_p.y, _p.x), true, w.pState[s] === PlayerState.Downed);
    }
    audio.setListener(fx0, fy0);
    audio.tick(w, localSlot, dt);
    crowd.update(w, alpha, nowSec);
    fx.update(dt);
    ragdolls.update(dt);
    pickups.update(w, nowSec);
    {
      const tags: { px: number; py: number; text: string; color: string }[] = [];
      const names = ui.powerupNames;
      for (const dr of pickups.drops) {
        _p.set(dr.x, 1.35, dr.z).project(stage.camera);
        if (Math.abs(_p.x) > 1 || Math.abs(_p.y) > 1) continue;
        tags.push({ px: ((_p.x + 1) / 2) * app.clientWidth, py: ((1 - _p.y) / 2) * app.clientHeight, text: dr.kind === 3 ? ui.weaponName(WEAPON_IDS[dr.data] ?? '') : (names[dr.kind] ?? ''), color: TIER_COLORS[dr.tier]! });
      }
      ui.setPickupLabels(tags);
    }

    let n = 0;
    strength.length = 0;
    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!w.bActive[i]) continue;
      const wid = WEAPON_IDS[w.pWeapon[w.bOwner[i]!]!]!;
      const tr = TRACER[wid];
      const owner = w.bOwner[i]!;
      if (!strength[owner]) strength[owner] = strengthOf(w, owner);
      const st = strength[owner]!;
      // bullets fly fast now: draw them between the last two simulated positions instead of jumping a whole step
      const back = (1 - alpha) * TICK_DT;
      dummy.position.set(w.bX[i]! - w.bVx[i]! * back, BALANCE.weapons[wid].muzzleH, -(w.bY[i]! - w.bVy[i]! * back));
      q.setFromUnitVectors(fwd, dir.set(w.bVx[i]!, 0, -w.bVy[i]!).normalize());
      dummy.quaternion.copy(q);
      // upgrades show in the rounds: damage fattens and reddens them, piercing stretches them, crits flash gold
      const fat = 1 + Math.min(0.35, st.damage * 0.5);
      dummy.scale.copy(tracerScale.set(tr.w * fat, tr.w * fat, tr.l * 1.6 * (1 + Math.min(0.6, st.pierce * 0.2 + st.damage * 0.2))));
      dummy.updateMatrix();
      bulletMesh.setMatrixAt(n, dummy.matrix);
      dummy.scale.multiply(GLOW_SCALE);
      dummy.updateMatrix();
      bulletGlow.setMatrixAt(n, dummy.matrix);
      tracerColor.copy(tr.color).lerp(HOT, Math.min(0.85, st.damage * 1.2));
      if (st.pierce > 0.2) tracerColor.lerp(COOL, Math.min(0.6, st.pierce * 0.3));
      if (st.crit > 0 && (i * 7 + w.tick) % 5 === 0) tracerColor.set('#ffd21f');
      tracerColor.multiplyScalar(1.25 + stage.night * 0.6);
      bulletMesh.setColorAt(n, tracerColor);
      bulletGlow.setColorAt(n++, tracerColor);
      if (wid === 'flamer' && (i + w.tick) % 3 === 0) fx.flame(w.bX[i]!, w.bY[i]!, BALANCE.weapons.flamer.muzzleH);
    }
    dummy.scale.setScalar(1);
    bulletMesh.count = n;
    bulletGlow.count = n;
    bulletGlow.instanceMatrix.needsUpdate = true;
    if (bulletGlow.instanceColor) bulletGlow.instanceColor.needsUpdate = true;
    bulletMesh.instanceMatrix.needsUpdate = true;
    if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
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

  updateCursor();
  stage.render();
  frameMs += performance.now() - t0;
  frameN++;
  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(frames / fpsT);
    perf.fps = fps;
    adaptScale(fps, 0.5);
    perf.simMs = stepN ? stepMs / stepN : 0;
    perf.frameMs = frameN ? frameMs / frameN : 0;
    perf.calls = stage.renderer.info.render.calls;
    perf.triangles = stage.renderer.info.render.triangles;
    perf.enemies = world?.enemyCount ?? 0;
    perf.corpses = crowd.corpseCount;
    perf.particles = fx.particleCount;
    frames = 0; fpsT = 0; stepMs = 0; stepN = 0; frameMs = 0; frameN = 0;
    if (dev.perf || settings.showFps) {
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

hideLoading();
