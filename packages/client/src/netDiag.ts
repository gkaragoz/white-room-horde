/**
 * Network and frame diagnostics for the "my game freezes" reports: one sample per second kept for five minutes, a log of
 * every stall (a frame or a server tick that took more than a quarter of a second) with the most likely cause, a one-line
 * HUD summary and a text report that can be copied with F4 and pasted into a bug report.
 */
export interface DiagSample {
  /** Seconds since the page loaded. */
  t: number;
  fps: number;
  frameP95: number;
  frameMax: number;
  longTasks: number;
  longTaskMax: number;
  rtt: number;
  jitter: number;
  backlog: number;
  playout: number;
  bufferedBytes: number;
  hidden: boolean;
  inputsSent: number;
  stepsPerSecond: number;
}

export interface DiagInfo {
  rtt: number;
  jitter: number;
  backlog: number;
  playout: number;
  bufferedBytes: number;
}

const STALL_MS = 250;
const KEEP = 300;

export class NetDiag {
  readonly samples: DiagSample[] = [];
  readonly stalls: { t: number; ms: number; cause: string }[] = [];
  private frames: number[] = [];
  private lastFrame = 0;
  private longTasks: number[] = [];
  private inputs = 0;
  private steps = 0;
  private hiddenAt = -1e9;
  private lastBundleStall = -1e9;

  constructor() {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.longTasks.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* not supported (Firefox, Safari): the frame gaps still tell */
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hiddenAt = performance.now();
    });
  }

  /** Once per rendered frame; `steps` is how many simulation ticks it ran. */
  frame(now: number, steps: number): void {
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.frames.push(dt);
      if (dt > STALL_MS) {
        const wasHidden = document.hidden || now - this.hiddenAt < dt + 1000;
        const longest = this.longTasks.length ? Math.max(...this.longTasks) : 0;
        const cause = wasHidden
          ? 'tab was in the background (the browser pauses frames)'
          : longest > STALL_MS * 0.6
            ? `a long task of ${Math.round(longest)} ms (script or garbage collection)`
            : 'frames were not delivered (GPU busy or window covered)';
        this.stalls.push({ t: now / 1000, ms: Math.round(dt), cause });
      }
    }
    this.lastFrame = now;
    this.steps += steps;
    if (this.stalls.length > 60) this.stalls.shift();
  }

  /** The local input went out. */
  input(): void {
    this.inputs++;
  }

  /** The server has been silent for this long while we are playing online. */
  bundleGap(ms: number, now: number): void {
    if (ms > STALL_MS && now - this.lastBundleStall > 1000) {
      this.lastBundleStall = now;
      this.stalls.push({ t: now / 1000, ms: Math.round(ms), cause: 'no server tick arrived (network or relay)' });
    }
  }

  /** Close the current second. */
  sample(now: number, info: DiagInfo): void {
    const f = [...this.frames].sort((a, b) => a - b);
    const secs = Math.max(0.001, f.reduce((a, b) => a + b, 0) / 1000);
    this.samples.push({
      t: Math.round(now / 100) / 10,
      fps: Math.round(f.length / secs),
      frameP95: Math.round(f[Math.floor(f.length * 0.95)] ?? 0),
      frameMax: Math.round(f[f.length - 1] ?? 0),
      longTasks: this.longTasks.length,
      longTaskMax: Math.round(this.longTasks.length ? Math.max(...this.longTasks) : 0),
      rtt: Math.round(info.rtt),
      jitter: Math.round(info.jitter * 10) / 10,
      backlog: info.backlog,
      playout: info.playout,
      bufferedBytes: info.bufferedBytes,
      hidden: document.hidden,
      inputsSent: this.inputs,
      stepsPerSecond: this.steps,
    });
    if (this.samples.length > KEEP) this.samples.shift();
    this.frames = [];
    this.longTasks = [];
    this.inputs = 0;
    this.steps = 0;
  }

  /** A short line for the on-screen display. */
  line(): string {
    const s = this.samples[this.samples.length - 1];
    if (!s) return '';
    const last = this.stalls[this.stalls.length - 1];
    return `net: rtt ${s.rtt} ms &middot; jitter ${s.jitter} ms &middot; buffer ${s.playout} &middot; backlog ${s.backlog} &middot; inputs/s ${s.inputsSent} &middot; frame p95 ${s.frameP95} ms max ${s.frameMax} ms &middot; stalls ${this.stalls.length}${last ? ` (last ${last.ms} ms: ${last.cause})` : ''}`;
  }

  /** Everything, as text for a bug report. */
  report(extra = ''): string {
    const head = `white-room-horde network report\n${new Date().toISOString()}\n${navigator.userAgent}\n${extra}\n`;
    const stalls = this.stalls.length ? this.stalls.map((s) => `  t=${s.t.toFixed(1)}s ${s.ms} ms: ${s.cause}`).join('\n') : '  none';
    const rows = this.samples
      .map((s) => `${s.t}\tfps ${s.fps}\tp95 ${s.frameP95}\tmax ${s.frameMax}\tlong ${s.longTasks}/${s.longTaskMax}\trtt ${s.rtt}\tjit ${s.jitter}\tbuf ${s.playout}\tback ${s.backlog}\tws ${s.bufferedBytes}\tin ${s.inputsSent}\tsteps ${s.stepsPerSecond}${s.hidden ? '\thidden' : ''}`)
      .join('\n');
    return `${head}\nstalls (> ${STALL_MS} ms):\n${stalls}\n\nper second:\n${rows}\n`;
  }
}
