import { WEAPON_IDS } from '@wrh/shared';
import type { SimEvent } from '@wrh/sim';
import { asset } from './assets';

type Sfx = 'shot' | 'midShot' | 'bigShot' | 'cannonShot' | 'throw' | 'heavyShot' | 'hit' | 'death' | 'boom' | 'hurt' | 'down' | 'revive' | 'level' | 'pick' | 'wave' | 'boss' | 'over';

/** Minimum gap between two sounds of one kind, so a minigun or a crowd does not turn into a wall of noise. */
const GAP: Record<Sfx, number> = { midShot: 0.04, bigShot: 0.05, cannonShot: 0.08, throw: 0.1, shot: 0.035, heavyShot: 0.05, hit: 0.04, death: 0.05, boom: 0.1, hurt: 0.1, down: 0.3, revive: 0.3, level: 0.3, pick: 0.1, wave: 0.5, boss: 0.5, over: 1 };

/** Recorded effects (CC0, see public/sfx/CREDITS.md). Each name picks a random file and varies the pitch a little. */
const n3 = (p: string): string[] => [0, 1, 2].map((i) => `${p}_00${i}`);
const BANK: Partial<Record<Sfx, { files: string[]; gain: number; rate: [number, number] }>> = {
  shot: { files: ['shot_01', 'shot_02', 'shot_03'], gain: 0.55, rate: [0.95, 1.08] },
  midShot: { files: ['bang_01', 'bang_02', 'bang_03', 'bang_04', 'bang_05', 'bang_06'], gain: 0.6, rate: [0.95, 1.05] },
  bigShot: { files: ['bang_07', 'bang_08', 'bang_09', 'bang_10'], gain: 0.75, rate: [0.9, 1.0] },
  cannonShot: { files: ['cannon_01', 'cannon_02', 'cannon_03'], gain: 0.8, rate: [0.9, 1.0] },
  heavyShot: { files: ['bang_07', 'bang_08', 'cannon_01'], gain: 0.8, rate: [0.9, 1.0] },
  boom: { files: ['explosion', 'cannon_04', 'cannon_05'], gain: 1, rate: [0.8, 0.95] },
  hit: { files: [...n3('impactPunch_medium'), ...n3('impactSoft_medium')], gain: 0.35, rate: [0.9, 1.2] },
  death: { files: n3('impactSoft_heavy'), gain: 0.55, rate: [0.8, 1.05] },
  hurt: { files: n3('impactPunch_heavy'), gain: 0.8, rate: [0.9, 1.0] },
  down: { files: n3('impactSoft_heavy'), gain: 0.9, rate: [0.6, 0.7] },
  throw: { files: n3('impactMetal_light'), gain: 0.7, rate: [0.9, 1.1] },
  pick: { files: n3('impactBell_heavy'), gain: 0.5, rate: [1.1, 1.25] },
  level: { files: ['bell_01'], gain: 0.7, rate: [1, 1] },
  revive: { files: ['bell_01'], gain: 0.6, rate: [1.3, 1.3] },
  wave: { files: ['gong_01'], gain: 0.6, rate: [1, 1] },
  boss: { files: ['gong_02', 'cannon_05'], gain: 1, rate: [0.7, 0.7] },
  over: { files: ['gong_02'], gain: 0.9, rate: [0.55, 0.55] },
};

/** Every file the bank refers to (QA checks they all decode). */
export const BANK_FILES: string[] = [...new Set(Object.values(BANK).flatMap((b) => b.files))];

/**
 * Recorded effects with a synthesised fallback (browser cannot decode ogg, or a file is missing). sound effects (WebAudio, no files). Real recorded effects from a free library replace these
 * later (docs/DESIGN.md section 10); this gives the game feedback, volume control and positional-free mixing now.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<Sfx, number>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading = false;
  volume = 0.6;
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
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.loadBank();
  }

  /** Fetch and decode every file of the bank once; failures just leave the synth fallback in place. */
  private async loadBank(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const names = new Set<string>();
    for (const b of Object.values(BANK)) for (const f of b.files) names.add(f);
    await Promise.all(
      [...names].map(async (n) => {
        try {
          const res = await fetch(asset(`sfx/${n}.ogg`));
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(n, buf);
        } catch {
          /* synth fallback */
        }
      }),
    );
  }

  /** QA: wait until the bank is decoded (or time runs out) and report what loaded. */
  async whenLoaded(ms = 6000): Promise<{ loaded: string[]; durations: Record<string, number> }> {
    const t0 = performance.now();
    while (this.buffers.size < BANK_FILES.length && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
    const durations: Record<string, number> = {};
    for (const [k, v] of this.buffers) durations[k] = v.duration;
    return { loaded: [...this.buffers.keys()], durations };
  }

  get loadedSamples(): number {
    return this.buffers.size;
  }

  private playBank(name: Sfx): boolean {
    const b = BANK[name];
    if (!b || !this.ctx || !this.master) return false;
    const avail = b.files.filter((f) => this.buffers.has(f));
    if (!avail.length) return false;
    const file = avail[Math.floor(Math.random() * avail.length)]!;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(file)!;
    src.playbackRate.value = b.rate[0] + Math.random() * (b.rate[1] - b.rate[0]);
    const g = this.ctx.createGain();
    g.gain.value = b.gain * (0.9 + Math.random() * 0.2);
    src.connect(g).connect(this.master);
    src.start();
    // the big explosion and the boss roar layer a second sample
    if (name === 'boom' || name === 'boss') {
      const extra = avail[Math.floor(Math.random() * avail.length)]!;
      if (extra !== file) {
        const s2 = this.ctx.createBufferSource();
        s2.buffer = this.buffers.get(extra)!;
        s2.playbackRate.value = b.rate[0];
        const g2 = this.ctx.createGain();
        g2.gain.value = b.gain * 0.6;
        s2.connect(g2).connect(this.master);
        s2.start();
      }
    }
    return true;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

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

  play(name: Sfx): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < GAP[name]) return;
    this.last.set(name, now);
    if (this.playBank(name)) return;
    switch (name) {
      case 'midShot':
      case 'bigShot':
      case 'cannonShot':
      case 'throw':
      case 'shot':
        this.burst(0.09, 0.35, 5200);
        this.tone(220 + Math.random() * 40, 70, 0.07, 'square', 0.12);
        break;
      case 'heavyShot':
        this.burst(0.22, 0.6, 3200);
        this.tone(120, 38, 0.2, 'sawtooth', 0.3);
        break;
      case 'hit':
        this.tone(160, 90, 0.05, 'triangle', 0.12);
        break;
      case 'death':
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
        this.tone(523, 784, 0.15, 'triangle', 0.25);
        break;
      case 'wave':
        this.tone(196, 196, 0.35, 'sawtooth', 0.2);
        this.tone(147, 147, 0.5, 'sawtooth', 0.2, 0.2);
        break;
      case 'boss':
        this.tone(70, 40, 1.2, 'sawtooth', 0.5);
        this.burst(1.0, 0.4, 600);
        break;
      case 'over':
        this.tone(220, 55, 1.5, 'sawtooth', 0.4);
        break;
    }
  }

  onEvent(e: SimEvent, localSlot: number): void {
    switch (e.type) {
      case 'shot': {
        if (e.slot !== localSlot && Math.random() < 0.5) return; // thin out the squad's gunfire
        const w = WEAPON_IDS[e.weapon];
        this.play(w === 'sniper' ? 'cannonShot' : w === 'shotgun' ? 'heavyShot' : w === 'hmg' ? 'bigShot' : w === 'ar' || w === 'minigun' ? 'midShot' : 'shot');
        break;
      }
      case 'grenadeThrown':
        this.play('throw');
        break;
      case 'enemyHit':
        this.play('hit');
        break;
      case 'enemyDeath':
        this.play('death');
        break;
      case 'explosion':
        this.play('boom');
        break;
      case 'playerHit':
        if (e.slot === localSlot) this.play('hurt');
        break;
      case 'playerDown':
        this.play('down');
        break;
      case 'playerRevive':
        this.play('revive');
        break;
      case 'levelUp':
        this.play('level');
        break;
      case 'cardPicked':
        this.play('pick');
        break;
      case 'waveStart':
        this.play(e.boss ? 'boss' : 'wave');
        break;
      case 'gameOver':
        this.play('over');
        break;
      default:
        break;
    }
  }
}
