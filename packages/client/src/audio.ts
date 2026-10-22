import { viewOf } from './view/worldView';
import { ENEMY_TYPES, MAX_ENEMIES, MAX_PLAYERS, WEAPON_IDS, type WeaponId } from '@wrh/shared';
import type { SimEvent, World } from '@wrh/sim';
import { asset } from './assets';
import { SCREEN_RIGHT } from './controls';
import { AUDIO_FORMATS } from './preload';

/** One sound kind per weapon (recorded reports, see public/sfx/CREDITS.md) and three reload sounds. */
export type GunSfx = `gun_${WeaponId}`;
export type Sfx =
  | GunSfx | 'reloadPistol' | 'reloadRifle' | 'reloadShotgun'
  | 'shot' | 'midShot' | 'bigShot' | 'cannonShot' | 'heavyShot' | 'throw' | 'hit' | 'death' | 'boom' | 'hurt' | 'down' | 'revive'
  | 'level' | 'pick' | 'wave' | 'boss' | 'over' | 'zGroan' | 'zAttack' | 'zHit' | 'zDeath' | 'zScream' | 'step' | 'pickup' | 'pickupDrop' | 'spit'
  | 'reload' | 'reloadDone' | 'dash' | 'bossRoar' | 'uiClick' | 'uiConfirm' | 'uiBack' | 'uiError' | 'uiOpen' | 'uiClose' | 'heart'
  | 'floorCleared' | 'countTick' | 'countGo' | 'floorCharge' | 'floorLift' | 'floorArrive' | 'floorStart'
  | 'cardOffer' | 'iceFreeze' | 'iceThaw' | 'nuke' | 'secondWind' | 'weaponGet' | 'dead' | 'floorEnter' | 'slowIn' | 'slowOut' | 'impactWall' | 'barrelHit'
  | 'pounce' | 'grab' | 'warhorn' | 'thunder' | 'quake' | 'mineBeep' | 'spikeVolley' | 'shockPulse' | 'buildThud' | 'buildThudBig' | 'crumble' | 'crumbleBig' | 'boneCrack' | 'fleshHit' | 'goreDecap' | 'goreTear' | 'gibBurst'
  | 'warnCircle' | 'warnLine' | 'slamHit' | 'purge' | 'acidSplash' | 'launch' | 'chargeUp' | 'pullHum' | 'blinkZap' | 'abilityBuff' | 'abilityPower' | 'abilityWhoosh' | 'airstrikeCall'
  | 'droneGun' | 'droneTwin' | 'droneRocket' | 'droneZap' | 'droneHeal' | 'dronePulse' | 'droneFreeze' | 'droneHum' | 'droneUnlock' | 'droneLevel' | 'droneTier' | 'droneSwap'
  | 'vo_firstblood' | 'vo_doublekill' | 'vo_triplekill' | 'vo_megakill' | 'vo_killingspree' | 'vo_rampage' | 'vo_dominating' | 'vo_massacre' | 'vo_godlike' | 'vo_mayhem' | 'vo_ownage' | 'vo_carnage';

/** Minimum gap between two sounds of one kind, so a minigun or a crowd does not turn into a wall of noise. */
const GUN_GAP = 0.02;
const GAP: Record<Sfx, number> = {
  ...(Object.fromEntries(WEAPON_IDS.map((w) => [`gun_${w}`, GUN_GAP])) as Record<GunSfx, number>),
  reloadPistol: 0.2, reloadRifle: 0.2, reloadShotgun: 0.2,
  shot: 0.035, midShot: 0.04, bigShot: 0.05, cannonShot: 0.08, heavyShot: 0.05, throw: 0.1, hit: 0.04, death: 0.05, boom: 0.1, hurt: 0.1, down: 0.3, revive: 0.3,
  level: 0.3, pick: 0.1, wave: 0.5, boss: 0.5, over: 1, zGroan: 0.25, zAttack: 0.12, zHit: 0.05, zDeath: 0.06, zScream: 0.4, step: 0.12, pickup: 0.06, pickupDrop: 0.15, spit: 0.15,
  reload: 0.2, reloadDone: 0.2, dash: 0.2, bossRoar: 0.5, uiClick: 0.03, uiConfirm: 0.1, uiBack: 0.1, uiError: 0.2, uiOpen: 0.1, uiClose: 0.1, heart: 0.3,
  droneGun: 0.07, droneTwin: 0.06, droneRocket: 0.35, droneZap: 0.1, droneHeal: 1.2, dronePulse: 0.8, droneFreeze: 0.6, droneHum: 2.2, droneUnlock: 0.4, droneLevel: 0.2, droneTier: 0.4, droneSwap: 0.3,
  floorCleared: 0.5, countTick: 0.2, countGo: 0.2, floorCharge: 0.5, floorLift: 1, floorArrive: 0.5, floorStart: 0.5,
  cardOffer: 0.3, iceFreeze: 0.5, iceThaw: 0.3, nuke: 2, secondWind: 1, weaponGet: 0.2, dead: 0.5, floorEnter: 1, slowIn: 1, slowOut: 1, impactWall: 0.05, barrelHit: 0.1,
  pounce: 0.15, grab: 0.2, warhorn: 0.6, thunder: 0.3, quake: 0.4, mineBeep: 0.2, spikeVolley: 0.2, shockPulse: 0.2, buildThud: 0.07, buildThudBig: 0.12, crumble: 0.07, crumbleBig: 0.12, boneCrack: 0.06, fleshHit: 0.05, goreDecap: 0.2, goreTear: 0.2, gibBurst: 0.15,
  warnCircle: 0.25, warnLine: 0.4, slamHit: 0.1, purge: 1, acidSplash: 0.15, launch: 0.2, chargeUp: 0.25, pullHum: 0.8, blinkZap: 0.1, abilityBuff: 0.2, abilityPower: 0.2, abilityWhoosh: 0.2, airstrikeCall: 0.5,
  vo_firstblood: 0, vo_doublekill: 0, vo_triplekill: 0, vo_megakill: 0, vo_killingspree: 0, vo_rampage: 0, vo_dominating: 0, vo_massacre: 0, vo_godlike: 0, vo_mayhem: 0, vo_ownage: 0, vo_carnage: 0,
};

type Entry = { files: string[]; gain: number; rate: [number, number] };
const n3 = (p: string): string[] => [0, 1, 2].map((i) => `${p}_00${i}`);
const z = (...ids: number[]): string[] => ids.map((i) => `zombie-${i}`);

/** Takes recorded per weapon, and how each one is voiced: loudness and the pitch range (lower = heavier). */
const GUNS: Record<WeaponId, { takes: number; gain: number; rate: [number, number] }> = {
  pistol: { takes: 2, gain: 0.85, rate: [0.97, 1.05] },
  revolver: { takes: 2, gain: 1.0, rate: [0.95, 1.0] },
  mp: { takes: 3, gain: 0.8, rate: [1.0, 1.1] },
  smg: { takes: 3, gain: 0.8, rate: [0.97, 1.05] },
  ar: { takes: 2, gain: 0.85, rate: [0.97, 1.03] },
  shotgun: { takes: 2, gain: 1.0, rate: [0.95, 1.0] },
  dbl: { takes: 2, gain: 1.1, rate: [0.88, 0.96] },
  hmg: { takes: 3, gain: 1.0, rate: [0.8, 0.9] },
  minigun: { takes: 3, gain: 0.7, rate: [1.05, 1.15] },
  sniper: { takes: 3, gain: 1.0, rate: [0.95, 1.0] },
  dmr: { takes: 3, gain: 0.95, rate: [0.97, 1.03] },
  flamer: { takes: 3, gain: 0.9, rate: [0.95, 1.1] },
  gl: { takes: 3, gain: 1.0, rate: [0.95, 1.0] },
  sword: { takes: 3, gain: 0.9, rate: [0.95, 1.08] },
  hammer: { takes: 2, gain: 1.0, rate: [0.92, 1.0] },
  railgun: { takes: 2, gain: 1.0, rate: [0.95, 1.0] },
  crossbow: { takes: 2, gain: 0.8, rate: [0.95, 1.08] },
  plasma: { takes: 2, gain: 0.85, rate: [0.95, 1.08] },
  rocket: { takes: 2, gain: 1.0, rate: [0.92, 1.0] },
  nailgun: { takes: 2, gain: 0.7, rate: [0.95, 1.1] },
  autoshotgun: { takes: 2, gain: 0.95, rate: [0.95, 1.05] },
  akimbo: { takes: 2, gain: 0.8, rate: [0.97, 1.06] },
  frostgun: { takes: 2, gain: 0.8, rate: [0.95, 1.08] },
  sawlauncher: { takes: 2, gain: 0.9, rate: [0.95, 1.05] },
  arcthrower: { takes: 2, gain: 0.8, rate: [0.95, 1.1] },
};

/** Recorded effects (CC0, see public/sfx/CREDITS.md). Each name picks a random file and varies the pitch a little. */
const BANK: Partial<Record<Sfx, Entry>> = {
  ...(Object.fromEntries(
    WEAPON_IDS.map((w) => [`gun_${w}`, { files: Array.from({ length: GUNS[w].takes }, (_, i) => `gun_${w}_${i + 1}`), gain: GUNS[w].gain, rate: GUNS[w].rate }]),
  ) as Record<GunSfx, Entry>),
  reloadPistol: { files: ['reload_pistol'], gain: 0.7, rate: [0.97, 1.03] },
  reloadRifle: { files: ['reload_rifle'], gain: 0.7, rate: [0.97, 1.03] },
  reloadShotgun: { files: ['reload_shotgun'], gain: 0.8, rate: [0.97, 1.03] },
  shot: { files: ['shot_01', 'shot_02', 'shot_03'], gain: 0.55, rate: [0.95, 1.08] },
  midShot: { files: ['bang_01', 'bang_02', 'bang_03', 'bang_04', 'bang_05', 'bang_06'], gain: 0.6, rate: [0.95, 1.05] },
  bigShot: { files: ['bang_07', 'bang_08', 'bang_09', 'bang_10'], gain: 0.75, rate: [0.9, 1.0] },
  cannonShot: { files: ['cannon_01', 'cannon_02', 'cannon_03'], gain: 0.8, rate: [0.9, 1.0] },
  heavyShot: { files: ['bang_07', 'bang_08', 'cannon_01'], gain: 0.8, rate: [0.9, 1.0] },
  boom: { files: ['explosion', 'cannon_04', 'cannon_05'], gain: 1, rate: [0.8, 0.95] },
  hit: { files: [...n3('impactPunch_medium'), ...n3('impactSoft_medium')], gain: 0.3, rate: [0.9, 1.2] },
  death: { files: n3('impactSoft_heavy'), gain: 0.45, rate: [0.8, 1.05] },
  hurt: { files: n3('impactPunch_heavy'), gain: 0.8, rate: [0.9, 1.0] },
  down: { files: n3('impactSoft_heavy'), gain: 0.9, rate: [0.6, 0.7] },
  throw: { files: n3('impactMetal_light'), gain: 0.7, rate: [0.9, 1.1] },
  pick: { files: n3('impactBell_heavy'), gain: 0.5, rate: [1.1, 1.25] },
  level: { files: ['bell_01'], gain: 0.7, rate: [1, 1] },
  revive: { files: ['bell_01'], gain: 0.6, rate: [1.3, 1.3] },
  wave: { files: ['gong_01'], gain: 0.6, rate: [1, 1] },
  floorCleared: { files: ['floor_cleared'], gain: 0.7, rate: [1, 1] },
  countTick: { files: ['count_tick'], gain: 0.3, rate: [1, 1] },
  countGo: { files: ['count_go'], gain: 0.5, rate: [1, 1] },
  floorCharge: { files: ['floor_charge'], gain: 0.45, rate: [1, 1] },
  floorLift: { files: ['floor_lift'], gain: 0.4, rate: [1, 1] },
  floorArrive: { files: ['floor_arrive'], gain: 0.7, rate: [1, 1] },
  floorStart: { files: ['floor_start'], gain: 0.45, rate: [1, 1] },
  boss: { files: ['gong_02', 'cannon_05'], gain: 1, rate: [0.7, 0.7] },
  over: { files: ['gong_02'], gain: 0.9, rate: [0.55, 0.55] },
  // zombies: long groans idle/spawn, short barks when hurting, grunts when swinging, gurgles when dying
  zGroan: { files: z(16, 17, 18, 19, 20, 21), gain: 0.32, rate: [0.8, 1.15] },
  zAttack: { files: z(1, 4, 8, 9, 12, 15, 23), gain: 0.5, rate: [0.85, 1.1] },
  zHit: { files: z(2, 7, 10, 14, 22), gain: 0.28, rate: [0.9, 1.25] },
  zDeath: { files: z(3, 5, 6, 11, 13, 24), gain: 0.5, rate: [0.75, 1.1] },
  zScream: { files: z(16, 17), gain: 0.9, rate: [0.55, 0.7] },
  step: { files: ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004'], gain: 0.22, rate: [0.9, 1.15] },
  pickup: { files: ['ui_confirmation_002', 'ui_bong_001'], gain: 0.55, rate: [1, 1.2] },
  pickupDrop: { files: ['ui_drop_001'], gain: 0.3, rate: [0.9, 1.2] },
  spit: { files: ['ui_drop_001'], gain: 0.35, rate: [0.5, 0.65] },
  reload: { files: n3('impactMetal_light'), gain: 0.5, rate: [0.7, 0.8] },
  reloadDone: { files: n3('impactMetal_heavy'), gain: 0.5, rate: [1.1, 1.3] },
  dash: { files: n3('impactSoft_medium'), gain: 0.45, rate: [1.5, 1.8] },
  bossRoar: { files: z(16, 17, 18), gain: 0.9, rate: [0.5, 0.65] },
  uiClick: { files: ['ui_click_001', 'ui_click_002'], gain: 0.5, rate: [0.97, 1.05] },
  uiConfirm: { files: ['ui_confirmation_001'], gain: 0.55, rate: [1, 1] },
  uiBack: { files: ['ui_back_001'], gain: 0.5, rate: [1, 1] },
  uiError: { files: ['ui_error_001'], gain: 0.5, rate: [1, 1] },
  uiOpen: { files: ['ui_maximize_001'], gain: 0.5, rate: [1, 1] },
  uiClose: { files: ['ui_close_001'], gain: 0.5, rate: [1, 1] },
  cardOffer: { files: ['card_offer'], gain: 0.5, rate: [1, 1] },
  iceFreeze: { files: ['ice_freeze'], gain: 0.7, rate: [1, 1] },
  iceThaw: { files: ['ice_thaw'], gain: 0.6, rate: [0.95, 1.05] },
  nuke: { files: ['nuke_boom'], gain: 1, rate: [1, 1] },
  secondWind: { files: ['second_wind'], gain: 0.8, rate: [1, 1] },
  weaponGet: { files: ['weapon_get'], gain: 0.6, rate: [0.97, 1.03] },
  dead: { files: ['player_dead'], gain: 0.8, rate: [1, 1] },
  floorEnter: { files: ['floor_enter'], gain: 0.4, rate: [1, 1] },
  slowIn: { files: ['slowmo_in'], gain: 0.8, rate: [1, 1] },
  slowOut: { files: ['slowmo_out'], gain: 0.7, rate: [1, 1] },
  pounce: { files: ['pounce'], gain: 0.7, rate: [0.95, 1.1] },
  grab: { files: ['grab'], gain: 0.85, rate: [0.9, 1.05] },
  warhorn: { files: ['warhorn'], gain: 0.9, rate: [0.95, 1.05] },
  thunder: { files: ['thunder'], gain: 0.9, rate: [0.9, 1.1] },
  quake: { files: ['quake'], gain: 1.0, rate: [0.9, 1.05] },
  mineBeep: { files: ['mine_beep'], gain: 0.5, rate: [0.95, 1.1] },
  spikeVolley: { files: ['spike_volley'], gain: 0.7, rate: [0.95, 1.1] },
  shockPulse: { files: ['shock_pulse'], gain: 0.8, rate: [0.95, 1.1] },
  buildThud: { files: ['build_thud_1', 'build_thud_2', 'build_thud_3'], gain: 0.5, rate: [1.1, 1.4] },
  buildThudBig: { files: ['build_thud_1', 'build_thud_2', 'build_thud_3'], gain: 0.85, rate: [0.8, 1.0] },
  crumble: { files: ['crumble_1', 'crumble_2', 'crumble_3'], gain: 0.5, rate: [1.05, 1.3] },
  crumbleBig: { files: ['crumble_1', 'crumble_2', 'crumble_3'], gain: 0.85, rate: [0.8, 1.0] },
  boneCrack: { files: ['bone_crack_1', 'bone_crack_2', 'bone_crack_3'], gain: 0.75, rate: [0.92, 1.12] },
  fleshHit: { files: ['flesh_hit_1', 'flesh_hit_2', 'flesh_hit_3'], gain: 0.65, rate: [0.9, 1.1] },
  goreDecap: { files: ['gore_decap'], gain: 0.95, rate: [0.94, 1.06] },
  goreTear: { files: ['gore_tear'], gain: 0.9, rate: [0.94, 1.08] },
  gibBurst: { files: ['gib_burst'], gain: 0.95, rate: [0.92, 1.08] },
  impactWall: { files: n3('impactMetal_light'), gain: 0.22, rate: [1.3, 1.7] },
  barrelHit: { files: n3('impactMetal_heavy'), gain: 0.5, rate: [0.9, 1.1] },
  warnCircle: { files: ['warn_circle'], gain: 0.45, rate: [1, 1] },
  warnLine: { files: ['warn_line'], gain: 0.45, rate: [1, 1] },
  slamHit: { files: ['slam_hit'], gain: 0.9, rate: [0.93, 1.05] },
  purge: { files: ['purge_hit'], gain: 1, rate: [1, 1] },
  acidSplash: { files: ['acid_splash'], gain: 0.7, rate: [0.9, 1.1] },
  launch: { files: ['launch'], gain: 0.7, rate: [0.95, 1.1] },
  chargeUp: { files: ['charge_up'], gain: 0.5, rate: [0.9, 1.15] },
  pullHum: { files: ['pull_hum'], gain: 0.7, rate: [1, 1] },
  blinkZap: { files: ['blink_zap'], gain: 0.5, rate: [0.9, 1.2] },
  abilityBuff: { files: ['ability_buff'], gain: 0.7, rate: [1, 1] },
  abilityPower: { files: ['ability_power'], gain: 0.8, rate: [1, 1] },
  abilityWhoosh: { files: ['ability_whoosh'], gain: 0.7, rate: [1, 1] },
  airstrikeCall: { files: ['airstrike_call'], gain: 0.7, rate: [1, 1] },
  vo_firstblood: { files: ['vo_firstblood'], gain: 0.95, rate: [1, 1] },
  vo_doublekill: { files: ['vo_doublekill'], gain: 0.95, rate: [1, 1] },
  vo_triplekill: { files: ['vo_triplekill'], gain: 0.95, rate: [1, 1] },
  vo_megakill: { files: ['vo_megakill'], gain: 0.95, rate: [1, 1] },
  vo_killingspree: { files: ['vo_killingspree'], gain: 0.95, rate: [1, 1] },
  vo_rampage: { files: ['vo_rampage'], gain: 0.95, rate: [1, 1] },
  vo_dominating: { files: ['vo_dominating'], gain: 0.95, rate: [1, 1] },
  vo_massacre: { files: ['vo_massacre'], gain: 0.95, rate: [1, 1] },
  // the drones (recorded, see public/sfx/CREDITS.md): a support voice, quieter than the guns of the players
  droneGun: { files: ['drone_gun_1', 'drone_gun_2', 'drone_gun_3'], gain: 0.8, rate: [0.95, 1.1] },
  droneTwin: { files: ['drone_twin_1', 'drone_twin_2', 'drone_twin_3'], gain: 0.8, rate: [0.92, 1.08] },
  droneRocket: { files: ['drone_rocket_1', 'drone_rocket_2'], gain: 0.85, rate: [0.95, 1.1] },
  droneZap: { files: ['drone_zap_1', 'drone_zap_2', 'drone_zap_3'], gain: 0.85, rate: [0.95, 1.1] },
  droneHeal: { files: ['drone_heal_1', 'drone_heal_2', 'drone_heal_3'], gain: 0.7, rate: [0.97, 1.05] },
  dronePulse: { files: ['drone_pulse'], gain: 0.9, rate: [0.97, 1.05] },
  droneFreeze: { files: ['drone_freeze'], gain: 0.9, rate: [0.97, 1.03] },
  droneHum: { files: ['drone_hum'], gain: 0.8, rate: [0.96, 1.04] },
  droneUnlock: { files: ['drone_unlock'], gain: 0.8, rate: [1, 1] },
  droneLevel: { files: ['drone_level'], gain: 0.7, rate: [0.98, 1.02] },
  droneTier: { files: ['drone_tier'], gain: 0.8, rate: [1, 1] },
  droneSwap: { files: ['drone_swap'], gain: 0.7, rate: [0.97, 1.03] },
  vo_godlike: { files: ['vo_godlike'], gain: 0.95, rate: [1, 1] },
  vo_mayhem: { files: ['vo_mayhem'], gain: 0.95, rate: [1, 1] },
  vo_ownage: { files: ['vo_ownage'], gain: 0.95, rate: [1, 1] },
  vo_carnage: { files: ['vo_carnage'], gain: 0.95, rate: [1, 1] },
};

/** Sounds that come from a place in the arena (panned and quieter with distance). */
const SPATIAL = new Set<Sfx>(['droneGun', 'droneTwin', 'droneRocket', 'droneZap', 'droneHeal', 'dronePulse', 'droneFreeze', 'droneHum', ...WEAPON_IDS.map((w): Sfx => `gun_${w}`), 'reloadPistol', 'reloadRifle', 'reloadShotgun', 'reload', 'reloadDone', 'dash', 'shot', 'midShot', 'bigShot', 'cannonShot', 'heavyShot', 'throw', 'hit', 'death', 'boom', 'zGroan', 'zAttack', 'zHit', 'zDeath', 'step', 'pickup', 'pickupDrop', 'spit', 'impactWall', 'barrelHit', 'pounce', 'grab', 'warhorn', 'thunder', 'quake', 'mineBeep', 'spikeVolley', 'shockPulse', 'buildThud', 'buildThudBig', 'crumble', 'crumbleBig', 'boneCrack', 'fleshHit', 'goreDecap', 'goreTear', 'gibBurst', 'warnCircle', 'warnLine', 'slamHit', 'acidSplash', 'launch', 'chargeUp', 'pullHum', 'blinkZap']);

const VOICE_SFX = new Set<Sfx>(['vo_firstblood', 'vo_doublekill', 'vo_triplekill', 'vo_megakill', 'vo_killingspree', 'vo_rampage', 'vo_dominating', 'vo_massacre', 'vo_godlike', 'vo_mayhem', 'vo_ownage', 'vo_carnage', 'zGroan', 'zAttack', 'zHit', 'zDeath', 'zScream', 'bossRoar']);

/** Every file the bank refers to (QA checks they all decode). */
export const BANK_FILES: string[] = [...new Set(Object.values(BANK).flatMap((b) => b.files))];
export const MUSIC_FILES = ['determined_pursuit'];

const MAX_VOICES = 28;

const FORMATS = AUDIO_FORMATS;

/**
 * Recorded effects with a synthesised fallback (browser cannot decode ogg, or a file is missing), positional pan and
 * distance falloff, ambient zombie voices and footsteps driven by the world, looped music with ducking.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private music: AudioBufferSourceNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private reverbIn: GainNode | null = null;
  private readonly last = new Map<Sfx, number>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private voices = 0;
  private groanTimer = 0;
  private stepTimer = 0;
  private heartTimer = 0;
  private duck = 1;
  private duckTarget = 1;
  private listenerX = 0;
  private listenerY = 0;
  volume = 0.6;
  musicVolume = 0.5;
  muted = false;

  /** Browsers require a user gesture before sound can start. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    // a synthetic room: decaying noise as an impulse response, mixed in quietly for gunfire and explosions
    const irLen = Math.floor(this.ctx.sampleRate * 1.2);
    const ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.5;
    this.reverbIn = this.ctx.createGain();
    this.reverbIn.connect(conv).connect(wet).connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    // the music opens up (brighter, louder) as the horde grows
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.musicFilter.connect(this.musicGain);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.loadBank();
  }

  /** Decode `<base>.ogg`, or `<base>.mp3` when the browser cannot play Vorbis (Safari); either one failing falls back to the other. */
  private async load(name: string, base: string): Promise<void> {
    for (const ext of FORMATS) {
      try {
        const res = await fetch(asset(`${base}.${ext}`));
        if (!res.ok) continue;
        this.buffers.set(name, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
        return;
      } catch {
        /* try the other format */
      }
    }
    /* synth fallback / no music */
  }

  /** Fetch and decode every file of the bank once; failures just leave the synth fallback in place. */
  private async loadBank(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    await Promise.all(BANK_FILES.map((n) => this.load(n, `sfx/${n}`)));
    await Promise.all(MUSIC_FILES.map((n) => this.load('music:' + n, `music/${n}`)));
    if (this.wantMusic) this.startMusic();
  }

  /** QA: wait until the bank is decoded (or time runs out) and report what loaded. */
  async whenLoaded(ms = 8000): Promise<{ loaded: string[]; durations: Record<string, number> }> {
    const total = BANK_FILES.length + MUSIC_FILES.length;
    const t0 = performance.now();
    while (this.buffers.size < total && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
    const durations: Record<string, number> = {};
    for (const [k, v] of this.buffers) durations[k] = v.duration;
    return { loaded: [...this.buffers.keys()], durations };
  }

  get loadedSamples(): number {
    return this.buffers.size;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.applyMusicGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  // ---- music ----
  private wantMusic = false;

  private intensity = 0;
  /** Extra music energy at night (set by main). */
  nightBias = 0;
  /** Mixer settings: effects, zombie voices and menu sounds. */
  sfxVolume = 1;
  voiceVolume = 1;
  uiSounds = true;

  private applyMusicGain(): void {
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.musicVolume * (0.38 + 0.22 * this.intensity) * this.duck, this.ctx.currentTime, 0.3);
  }

  /** 0..1 energy of the fight (crowd size and a boss) steering the music brightness. */
  setIntensity(v: number): void {
    const next = Math.max(0, Math.min(1, v));
    if (Math.abs(next - this.intensity) < 0.02) return;
    this.intensity = next;
    if (this.musicFilter && this.ctx) this.musicFilter.frequency.setTargetAtTime(700 + 9000 * next * next, this.ctx.currentTime, 0.6);
    this.applyMusicGain();
  }

  get musicIntensity(): number {
    return this.intensity;
  }

  startMusic(): void {
    this.wantMusic = true;
    if (!this.ctx || this.music) return;
    const buf = this.buffers.get('music:determined_pursuit');
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicFilter!);
    src.start();
    this.music = src;
    this.applyMusicGain();
  }

  stopMusic(): void {
    this.wantMusic = false;
    if (this.music && this.ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      const m = this.music;
      this.music = null;
      setTimeout(() => m.stop(), 1800);
    }
  }

  /** Lower the music under big moments (boss roar, game over); it recovers on its own. */
  duckMusic(level: number, seconds: number): void {
    this.duckTarget = level;
    setTimeout(() => (this.duckTarget = 1), seconds * 1000);
  }

  // ---- synth fallbacks ----
  private tone(freq: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number, lowpass: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(lowpass, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, lowpass * 0.1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private synth(name: Sfx): void {
    if (name.startsWith('gun_')) {
      const w = name.slice(4) as WeaponId;
      if (w === 'flamer') this.burst(0.3, 0.5, 2400);
      else if (w === 'gl') this.tone(140, 40, 0.3, 'sine', 0.5);
      else if (w === 'sniper' || w === 'dmr' || w === 'hmg' || w === 'dbl' || w === 'shotgun' || w === 'revolver') this.synth('bigShot');
      else this.synth('shot');
      return;
    }
    if (name === 'reloadPistol' || name === 'reloadRifle' || name === 'reloadShotgun') {
      this.synth('reload');
      return;
    }
    switch (name) {
      case 'shot':
      case 'midShot':
        this.burst(0.09, 0.35, 5200);
        this.tone(220 + Math.random() * 40, 70, 0.07, 'square', 0.12);
        break;
      case 'bigShot':
      case 'cannonShot':
      case 'heavyShot':
        this.burst(0.22, 0.6, 3200);
        this.tone(120, 38, 0.2, 'sawtooth', 0.3);
        break;
      case 'hit':
      case 'zHit':
        this.tone(160, 90, 0.05, 'triangle', 0.12);
        break;
      case 'death':
      case 'zDeath':
        this.burst(0.18, 0.28, 1500);
        this.tone(140, 45, 0.18, 'sine', 0.22);
        break;
      case 'boom':
        this.burst(0.7, 0.9, 1800);
        this.tone(90, 28, 0.55, 'sine', 0.7);
        break;
      case 'hurt':
        this.tone(300, 120, 0.2, 'sawtooth', 0.25);
        break;
      case 'down':
        this.tone(260, 60, 0.6, 'sawtooth', 0.3);
        break;
      case 'revive':
        this.tone(330, 660, 0.25, 'sine', 0.25);
        this.tone(495, 990, 0.25, 'sine', 0.2, 0.1);
        break;
      case 'level':
        for (let i = 0; i < 4; i++) this.tone(392 * Math.pow(1.26, i), 392 * Math.pow(1.26, i), 0.18, 'triangle', 0.22, i * 0.07);
        break;
      case 'pick':
      case 'pickup':
      case 'uiConfirm':
        this.tone(523, 784, 0.15, 'triangle', 0.25);
        break;
      case 'floorCleared':
        // a short rising fanfare
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.32, 'triangle', 0.22, i * 0.11));
        break;
      case 'countTick':
        this.tone(880, 880, 0.07, 'sine', 0.16);
        break;
      case 'countGo':
        this.tone(1318, 1318, 0.14, 'triangle', 0.22);
        break;
      case 'floorCharge':
        this.tone(110, 880, 0.9, 'sawtooth', 0.12);
        this.tone(220, 1320, 0.9, 'sine', 0.1);
        break;
      case 'floorLift':
        this.burst(2.7, 0.35, 900);
        this.tone(90, 330, 2.7, 'sawtooth', 0.1);
        break;
      case 'floorArrive':
        this.tone(130, 45, 0.5, 'sine', 0.5);
        this.tone(523, 784, 0.5, 'triangle', 0.2, 0.08);
        this.tone(784, 1047, 0.6, 'triangle', 0.16, 0.2);
        break;
      case 'floorStart':
        this.tone(196, 196, 0.5, 'sawtooth', 0.2);
        this.tone(247, 247, 0.5, 'sawtooth', 0.16, 0.05);
        break;
      case 'wave':
        this.tone(196, 196, 0.35, 'sawtooth', 0.2);
        this.tone(147, 147, 0.5, 'sawtooth', 0.2, 0.2);
        break;
      case 'boss':
      case 'zScream':
        this.tone(70, 40, 1.2, 'sawtooth', 0.5);
        this.burst(1.0, 0.4, 600);
        break;
      case 'over':
        this.tone(220, 55, 1.5, 'sawtooth', 0.4);
        break;
      case 'zGroan':
      case 'zAttack':
        this.tone(110 + Math.random() * 40, 60, 0.4, 'sawtooth', 0.12);
        break;
      case 'step':
        this.burst(0.05, 0.12, 900);
        break;
      case 'heart':
        this.tone(60, 40, 0.14, 'sine', 0.5);
        this.tone(55, 38, 0.16, 'sine', 0.4, 0.2);
        break;
      case 'uiClick':
      case 'uiOpen':
      case 'uiClose':
      case 'uiBack':
        this.tone(900, 700, 0.04, 'square', 0.08);
        break;
      case 'uiError':
        this.tone(200, 150, 0.2, 'square', 0.12);
        break;
      case 'reload':
      case 'reloadDone':
        this.burst(0.05, 0.2, 2500);
        break;
      case 'dash':
        this.burst(0.18, 0.25, 3500);
        break;
      case 'bossRoar':
        this.tone(80, 45, 0.8, 'sawtooth', 0.4);
        break;
      default:
        break;
    }
  }

  // ---- playback ----
  /** Blood-and-gibs level (0 off); set by main. */
  gore = 1;
  private readonly availCache = new Map<string, string[]>();

  private playBank(name: Sfx, pan: number, gainMul: number): boolean {
    const b = BANK[name];
    if (!b || !this.ctx || !this.master) return false;
    let avail = this.availCache.get(name);
    if (!avail || avail.length !== b.files.length) {
      // the files of a sound that are decoded (a sound is looked up on every play, so the list is kept)
      avail = b.files.filter((f) => this.buffers.has(f));
      if (avail.length === b.files.length) this.availCache.set(name, avail);
    }
    if (!avail.length) return false;
    if (this.voices >= MAX_VOICES && !name.startsWith('ui') && name !== 'boom' && name !== 'hurt') return true; // dropped, but handled
    const file = avail[Math.floor(Math.random() * avail.length)]!;
    const wet = name.startsWith('gun_') ? 0.22 : name === 'boom' ? 0.35 : 0;
    this.voice(file, b.rate[0] + Math.random() * (b.rate[1] - b.rate[0]), b.gain * (0.9 + Math.random() * 0.2) * gainMul, pan, wet);
    // the big explosion and the boss roar layer a second sample
    if (name === 'boom' || name === 'boss') {
      const extra = avail[Math.floor(Math.random() * avail.length)]!;
      if (extra !== file) this.voice(extra, b.rate[0], b.gain * 0.6 * gainMul, pan);
    }
    return true;
  }

  private voice(file: string, rate: number, gain: number, pan: number, wet = 0): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.buffers.get(file)!;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    this.voices++;
    src.onended = () => this.voices--;
    if (pan !== 0 && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      src.connect(g).connect(p).connect(this.master!);
    } else {
      src.connect(g).connect(this.master!);
    }
    if (wet > 0 && this.reverbIn) {
      const send = c.createGain();
      send.gain.value = wet;
      g.connect(send).connect(this.reverbIn);
    }
    src.start();
  }

  private slotWeapon: (slot: number) => WeaponId | undefined = () => undefined;

  /** Which weapon a slot holds (reload sounds differ by gun). */
  setWeaponLookup(f: (slot: number) => WeaponId | undefined): void {
    this.slotWeapon = f;
  }

  private slotPos: (slot: number) => { x: number; y: number } | undefined = () => undefined;

  /** Lets events that only carry a slot (reloads) be placed in the arena. */
  setSlotLookup(f: (slot: number) => { x: number; y: number } | undefined): void {
    this.slotPos = f;
  }

  /** Stereo pan (-1 left .. 1 right on screen) and distance gain for a sound at a sim position. */
  spatial(at: { x: number; y: number }): { pan: number; gain: number } {
    const dx = at.x - this.listenerX;
    const dy = at.y - this.listenerY;
    const right = dx * SCREEN_RIGHT.x + dy * SCREEN_RIGHT.y;
    return { pan: Math.max(-0.85, Math.min(0.85, right / 14)), gain: 1 / (1 + (dx * dx + dy * dy) / 120) };
  }

  /** Play a sound; `at` (sim coordinates) makes it positional relative to the listener. */
  play(name: Sfx, at?: { x: number; y: number }): void {
    if (!this.ctx || this.muted) return;
    let pan = 0;
    let gainMul = 1;
    if (at && SPATIAL.has(name)) {
      const s = this.spatial(at);
      pan = s.pan;
      gainMul = s.gain;
      if (gainMul < 0.05) return;
    }
    if (name.startsWith('ui')) {
      if (!this.uiSounds) return;
    } else if (VOICE_SFX.has(name)) gainMul *= this.voiceVolume;
    else gainMul *= this.sfxVolume;
    if (gainMul <= 0.001) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < GAP[name]) return;
    this.last.set(name, now);
    if (this.playBank(name, pan, gainMul)) return;
    this.synth(name);
  }

  /** Seconds each announcer line lasts (so a lesser line does not talk over a bigger one). */
  private static readonly VO_LENGTH: Record<string, number> = { firstblood: 1.63, doublekill: 1.52, triplekill: 1.66, megakill: 1.93, killingspree: 2.07, rampage: 1.75, dominating: 1.62, massacre: 1.72, godlike: 2.01, mayhem: 1.16, ownage: 1.75, carnage: 1.49 };
  private voiceUntil = 0;
  private voicePriority = 0;

  /**
   * The announcer: one voice at a time. A line plays unless another is still talking with the same or a higher priority;
   * a higher priority line speaks over it. Returns whether it was spoken.
   */
  announce(line: string, priority: number): boolean {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now < this.voiceUntil && priority <= this.voicePriority) return false;
    this.voiceUntil = now + (Audio.VO_LENGTH[line] ?? 1.5);
    this.voicePriority = priority;
    this.play(`vo_${line}` as Sfx);
    return true;
  }

  /** UI feedback (clicks, confirmations, errors). */
  ui(name: 'click' | 'confirm' | 'back' | 'error' | 'open' | 'close'): void {
    this.play(('ui' + name[0]!.toUpperCase() + name.slice(1)) as Sfx);
  }

  onEvent(e: SimEvent, localSlot: number): void {
    switch (e.type) {
      case 'shot': {
        if (e.slot !== localSlot && Math.random() < 0.4) return; // thin out the squad's gunfire
        const w = WEAPON_IDS[e.weapon];
        this.play(`gun_${w!}`, e.slot === localSlot ? undefined : e);
        break;
      }
      case 'grenadeThrown':
        this.play('throw', e);
        break;
      case 'droneShot': {
        // a rocket is heard from every drone, the machine guns of the squad's drones are thinned out like their owners' guns
        if (e.kind !== 2 && e.slot !== localSlot && Math.random() < 0.55) return;
        const at = e.slot === localSlot ? undefined : { x: e.x, y: e.y };
        if (e.kind === 2) this.play('droneRocket', at);
        else if (e.kind === 3) this.play('droneGun', at);
        else if (e.kind === 4) this.play('droneTwin', at);
        break;
      }
      case 'droneZap':
        this.play('droneZap', e.slot === localSlot ? undefined : { x: e.pts[0]!, y: e.pts[1]! });
        break;
      case 'dronePulse':
        this.play(e.freeze ? 'droneFreeze' : 'dronePulse', e.slot === localSlot ? undefined : { x: e.x, y: e.y });
        break;
      case 'droneUnlock':
        if (e.slot === localSlot) this.play(e.fresh ? 'droneUnlock' : 'droneLevel');
        break;
      case 'droneLevel':
        if (e.slot === localSlot) this.play(e.level % 5 === 0 ? 'droneTier' : 'droneLevel');
        break;
      case 'droneSwap':
        if (e.slot === localSlot) this.play('droneSwap');
        break;
      case 'reloadStart': {
        const id = this.slotWeapon(e.slot);
        const kind: Sfx = id === 'shotgun' || id === 'dbl' || id === 'gl' ? 'reloadShotgun' : id === 'pistol' || id === 'revolver' || id === 'mp' ? 'reloadPistol' : 'reloadRifle';
        this.play(kind, e.slot === localSlot ? undefined : this.slotPos(e.slot));
        break;
      }
      case 'weaponSwitch':
        if (e.slot === localSlot) this.play('reloadDone');
        break;
      case 'reloadDone':
        this.play('reloadDone', e.slot === localSlot ? undefined : this.slotPos(e.slot));
        break;
      case 'dash':
        this.play('dash', e.slot === localSlot ? undefined : e);
        break;
      case 'bossAbility':
        this.play('bossRoar');
        if (e.kind === 'quake') this.play('quake', e);
        else if (e.kind === 'storm') this.play('thunder', e);
        else if (e.kind === 'plague') this.play('acidSplash', e);
        else if (e.kind === 'pounce') this.play('pounce', e);
        else if (e.kind === 'hurl') this.play('launch', e);
        else if (e.kind === 'summon') this.play('warhorn', e);
        break;
      case 'telegraph':
        this.play(e.shape === 1 ? 'warnLine' : 'warnCircle', e);
        break;
      case 'teleHit':
        this.play(e.effect === 1 || e.effect === 2 ? 'purge' : e.effect === 3 ? 'acidSplash' : 'slamHit', e);
        break;
      case 'launch':
        this.play('launch', e);
        break;
      case 'windup':
        this.play('chargeUp', e);
        break;
      case 'enemyAct': {
        const n = ENEMY_TYPES[e.etype];
        if (n === 'rammer') this.play('launch', e);
        else if (n === 'magnetar') this.play('pullHum', e);
        else if (n === 'flamer') this.play('gun_flamer', e);
        else if (n === 'pouncer') this.play('pounce', e);
        else if (n === 'hurler') this.play('launch', e);
        else if (n === 'grabber') this.play('grab', e);
        else if (n === 'spiker') this.play('spikeVolley', e);
        else if (n === 'shocker') this.play('shockPulse', e);
        else if (n === 'warcaller') this.play('warhorn', e);
        else if (n === 'chopper') this.play('abilityWhoosh', e);
        else if (n === 'quaker') this.play('quake', e);
        else if (n === 'trapper') this.play('mineBeep', e);
        break;
      }
      case 'blink':
        this.play('blinkZap', e);
        break;
      case 'ability': {
        const cls = e.cls;
        const kind: Sfx = cls === 0 || cls === 1 || cls === 5 ? 'abilityBuff' : cls === 3 || cls === 7 ? 'abilityWhoosh' : cls === 4 ? 'airstrikeCall' : 'abilityPower';
        this.play(kind, e.slot === localSlot ? undefined : e);
        break;
      }
      case 'swing': {
        const w = WEAPON_IDS[e.weapon];
        this.play(`gun_${w!}`, e.slot === localSlot ? undefined : e);
        break;
      }
      case 'thaw':
        this.play('iceThaw');
        break;
      case 'enemyHit':
        this.play('hit', e);
        if (Math.random() < 0.35) this.play('zHit', e);
        if (this.gore > 0) {
          if (Math.random() < 0.7) this.play('fleshHit', e);
          if (e.damage >= 26 && Math.random() < 0.55) this.play('boneCrack', e);
        }
        break;
      case 'enemyDeath':
        this.play('death', e);
        this.play('zDeath', e);
        if (this.gore > 0) {
          this.play('fleshHit', e);
          if (e.power >= 30 && Math.random() < 0.6) this.play('gibBurst', e);
          else if (Math.random() < 0.5) this.play('boneCrack', e);
        }
        break;
      case 'spit':
        this.play('spit', e);
        break;
      case 'explosion':
        this.play('boom', e);
        break;
      case 'playerHit':
        this.play('zAttack', e);
        if (e.slot === localSlot) this.play('hurt');
        break;
      case 'playerDown':
        this.play('down');
        break;
      case 'playerRevive':
        this.play('revive');
        break;
      case 'pickupDrop':
        this.play('pickupDrop', e);
        break;
      case 'pickup':
        this.play('pickup', e.slot === localSlot ? undefined : e);
        break;
      case 'levelUp':
        if (e.slot === localSlot) this.play('level');
        break;
      case 'cardPicked':
        this.play('pick');
        break;
      case 'waveCleared':
        this.play('floorCleared');
        break;
      case 'floorAscend':
        this.play('floorCharge');
        this.duckMusic(0.5, 4.5);
        break;
      case 'floorArrive':
        this.play('floorArrive');
        break;
      case 'waveStart':
        this.play(e.boss ? 'boss' : 'floorStart');
        if (e.boss) {
          this.play('zScream');
          this.duckMusic(0.45, 4);
        }
        break;
      case 'cardOffer':
        if (e.slot === localSlot) this.play('cardOffer');
        break;
      case 'freeze':
        this.play('iceFreeze');
        break;
      case 'nuke':
        this.play('nuke');
        this.duckMusic(0.35, 3.5);
        break;
      case 'secondWind':
        this.play('secondWind');
        break;
      case 'barrelHit':
        this.play('barrelHit', e);
        break;
      case 'weaponGet':
        if (e.slot === localSlot) this.play('weaponGet');
        break;
      case 'playerDead':
        this.play('dead');
        break;
      case 'floorEnter':
        this.play('floorEnter');
        break;
      case 'bulletGone':
        if (e.reason === 1) this.play('impactWall', e);
        break;
      case 'gameOver':
        this.play('over');
        this.duckMusic(0.25, 8);
        break;
      default:
        break;
    }
  }

  /**
   * Ambient layer driven by the world each frame: groans from nearby zombies (more of them, more often), footsteps of
   * players that are moving, and a heartbeat when the local player is hurt badly.
   */
  private droneTimer = 0;
  private droneHumGate = 0;

  tick(w: World, localSlot: number, dt: number): void {
    if (!this.ctx) return;
    const wv = viewOf(w);
    this.setIntensity(wv.enemyCount / 260 + (wv.bossUp ? 0.45 : 0) + this.nightBias);
    if (Math.abs(this.duck - this.duckTarget) > 0.01) {
      this.duck += (this.duckTarget - this.duck) * Math.min(1, dt * 2);
      this.applyMusicGain();
    }
    // zombie groans: pick a random living enemy near the listener
    this.groanTimer -= dt;
    if (this.groanTimer <= 0 && w.enemyCount > 0) {
      const crowd = Math.min(1, w.enemyCount / 200);
      this.groanTimer = 1.4 - crowd * 1.0 + Math.random() * 0.8;
      for (let tries = 0; tries < 12; tries++) {
        const i = Math.floor(Math.random() * MAX_ENEMIES);
        if (!w.eActive[i]) continue;
        const dx = w.eX[i]! - this.listenerX;
        const dy = w.eY[i]! - this.listenerY;
        if (dx * dx + dy * dy > 18 * 18) continue;
        const heavy = wv.isHeavy(i);
        this.play('zGroan', { x: w.eX[i]!, y: w.eY[i]! });
        if (heavy) this.play('zGroan', { x: w.eX[i]!, y: w.eY[i]! });
        break;
      }
    }
    // drones: the healer's beam sings while it heals, every awake drone of the listener's own hums quietly
    this.droneTimer -= dt;
    if (this.droneTimer <= 0) {
      this.droneTimer = 1.4;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!wv.alive(s) || w.pDrone[s] === 0 || w.pDWarm[s]! > 0) continue;
        const own = s === localSlot;
        if (w.pDrone[s] === 1 && w.dBeam[s * 4]! >= 0) this.play('droneHeal', own ? undefined : { x: w.dX[s]!, y: w.dY[s]! });
        else if (own && this.droneHumGate++ % 2 === 0) this.play('droneHum');
      }
    }
    // footsteps
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.3;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!wv.alive(s) || !w.pMoving[s]) continue;
        if (s !== localSlot && Math.random() < 0.5) continue;
        this.play('step', s === localSlot ? undefined : { x: w.pX[s]!, y: w.pY[s]! });
      }
    }
    // heartbeat when low
    const hp = wv.aliveHp(localSlot);
    if (wv.lowHealth(localSlot)) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.55 + hp * 1.6;
        this.play('heart');
      }
    }
  }
}

