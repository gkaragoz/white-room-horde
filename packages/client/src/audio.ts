import { WEAPON_IDS } from '@wrh/shared';
import type { SimEvent } from '@wrh/sim';

type Sfx = 'shot' | 'heavyShot' | 'hit' | 'death' | 'boom' | 'hurt' | 'down' | 'revive' | 'level' | 'pick' | 'wave' | 'boss' | 'over';

/** Minimum gap between two sounds of one kind, so a minigun or a crowd does not turn into a wall of noise. */
const GAP: Record<Sfx, number> = { shot: 0.035, heavyShot: 0.05, hit: 0.04, death: 0.05, boom: 0.1, hurt: 0.1, down: 0.3, revive: 0.3, level: 0.3, pick: 0.1, wave: 0.5, boss: 0.5, over: 1 };

/**
 * Synthesised placeholder sound effects (WebAudio, no files). Real recorded effects from a free library replace these
 * later (docs/DESIGN.md section 10); this gives the game feedback, volume control and positional-free mixing now.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<Sfx, number>();
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
    switch (name) {
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
      case 'shot':
        if (e.slot !== localSlot && Math.random() < 0.5) return; // thin out the squad's gunfire
        this.play(e.weapon === WEAPON_IDS.indexOf('shotgun') || e.weapon === WEAPON_IDS.indexOf('sniper') || e.weapon === WEAPON_IDS.indexOf('hmg') ? 'heavyShot' : 'shot');
        break;
      case 'grenadeThrown':
        this.play('pick');
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
