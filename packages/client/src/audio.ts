import { ENEMY_TYPES, MAX_ENEMIES, MAX_PLAYERS, PlayerState, WEAPON_IDS, type WeaponId } from '@wrh/shared';
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
  | 'floorCleared' | 'countTick' | 'countGo' | 'floorCharge' | 'floorLift' | 'floorArrive' | 'floorStart';

/** Minimum gap between two sounds of one kind, so a minigun or a crowd does not turn into a wall of noise. */
const GUN_GAP = 0.02;
const GAP: Record<Sfx, number> = {
  ...(Object.fromEntries(WEAPON_IDS.map((w) => [`gun_${w}`, GUN_GAP])) as Record<GunSfx, number>),
  reloadPistol: 0.2, reloadRifle: 0.2, reloadShotgun: 0.2,
  shot: 0.035, midShot: 0.04, bigShot: 0.05, cannonShot: 0.08, heavyShot: 0.05, throw: 0.1, hit: 0.04, death: 0.05, boom: 0.1, hurt: 0.1, down: 0.3, revive: 0.3,
  level: 0.3, pick: 0.1, wave: 0.5, boss: 0.5, over: 1, zGroan: 0.25, zAttack: 0.12, zHit: 0.05, zDeath: 0.06, zScream: 0.4, step: 0.12, pickup: 0.06, pickupDrop: 0.15, spit: 0.15,
  reload: 0.2, reloadDone: 0.2, dash: 0.2, bossRoar: 0.5, uiClick: 0.03, uiConfirm: 0.1, uiBack: 0.1, uiError: 0.2, uiOpen: 0.1, uiClose: 0.1, heart: 0.3,
  floorCleared: 0.5, countTick: 0.2, countGo: 0.2, floorCharge: 0.5, floorLift: 1, floorArrive: 0.5, floorStart: 0.5,
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
};

/** Sounds that come from a place in the arena (panned and quieter with distance). */
const SPATIAL = new Set<Sfx>([...WEAPON_IDS.map((w): Sfx => `gun_${w}`), 'reloadPistol', 'reloadRifle', 'reloadShotgun', 'reload', 'reloadDone', 'dash', 'shot', 'midShot', 'bigShot', 'cannonShot', 'heavyShot', 'throw', 'hit', 'death', 'boom', 'zGroan', 'zAttack', 'zHit', 'zDeath', 'step', 'pickup', 'pickupDrop', 'spit']);

const VOICE_SFX = new Set<Sfx>(['zGroan', 'zAttack', 'zHit', 'zDeath', 'zScream', 'bossRoar']);

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
  private playBank(name: Sfx, pan: number, gainMul: number): boolean {
    const b = BANK[name];
    if (!b || !this.ctx || !this.master) return false;
    const avail = b.files.filter((f) => this.buffers.has(f));
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
        break;
      case 'enemyHit':
        this.play('hit', e);
        if (Math.random() < 0.35) this.play('zHit', e);
        break;
      case 'enemyDeath':
        this.play('death', e);
        this.play('zDeath', e);
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
        this.play('level');
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
  tick(w: World, localSlot: number, dt: number): void {
    if (!this.ctx) return;
    let boss = false;
    for (let i = 0; i < MAX_ENEMIES && !boss; i++) if (w.eActive[i] && w.eBoss[i]) boss = true;
    this.setIntensity(w.enemyCount / 260 + (boss ? 0.45 : 0) + this.nightBias);
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
        const heavy = ENEMY_TYPES[w.eType[i]!] === 'tank' || w.eBoss[i] !== 0;
        this.play('zGroan', { x: w.eX[i]!, y: w.eY[i]! });
        if (heavy) this.play('zGroan', { x: w.eX[i]!, y: w.eY[i]! });
        break;
      }
    }
    // footsteps
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.3;
      for (let s = 0; s < MAX_PLAYERS; s++) {
        if (!w.pActive[s] || w.pState[s] !== PlayerState.Alive || !w.pMoving[s]) continue;
        if (s !== localSlot && Math.random() < 0.5) continue;
        this.play('step', s === localSlot ? undefined : { x: w.pX[s]!, y: w.pY[s]! });
      }
    }
    // heartbeat when low
    const hp = w.pActive[localSlot] && w.pState[localSlot] === PlayerState.Alive ? w.pHp[localSlot]! / w.pMaxHp[localSlot]! : 1;
    if (hp < 0.3) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.55 + hp * 1.6;
        this.play('heart');
      }
    }
  }
}

