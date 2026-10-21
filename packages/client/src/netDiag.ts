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
  /** Local character as drawn: frames that moved against the direction of travel, and the 99th percentile of the speed it was drawn at (units/s). */
  backward: number;
  drawP99: number;
  /** Prediction corrections absorbed, hard snaps, the biggest pending error (units), the input lead (ticks) and inputs that were late by more than a tick (ms, worst). */
  corrections: number;
  snaps: number;
  maxErr: number;
  lead: number;
  lateMax: number;
  coalesced: number;
}

export interface DiagInfo {
  rtt: number;
  jitter: number;
  backlog: number;
  playout: number;
  bufferedBytes: number;
  lead?: number;
  corrections?: number;
  snaps?: number;
  maxErr?: number;
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
  private drawSpeeds: number[] = [];
  private backward = 0;
  private lastDx = 0;
  private lastDy = 0;
  private lastX = NaN;
  private lastY = NaN;
  private lateMax = 0;
  private lastCorr = 0;
  private lastSnaps = 0;
  /** Input ticks the page swallowed because they arrived back to back after a hitch. */
  coalesced = 0;
  private coalescedSec = 0;
  /** Totals since the page loaded (read by scripts through window.__wrh.netstats()). */
  readonly totals = { frames: 0, backward: 0, maxDrawSpeed: 0, corrections: 0, snaps: 0, lateMax: 0, speeds: [] as number[] };
  private hiddenAt = -1e9;
  private lastBundleStall = -1e9;
  /** Page errors, unhandled promise rejections and console errors/warnings, newest last. */
  readonly errors: string[] = [];

  constructor() {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.longTasks.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* not supported (Firefox, Safari): the frame gaps still tell */
    }
    const note = (kind: string, text: string): void => {
      this.errors.push(`${(performance.now() / 1000).toFixed(1)}s ${kind}: ${text}`.slice(0, 600));
      if (this.errors.length > 80) this.errors.shift();
    };
    window.addEventListener('error', (e) => note('error', `${e.message} (${e.filename}:${e.lineno})`));
    window.addEventListener('unhandledrejection', (e) => note('rejection', String((e.reason as Error | undefined)?.stack ?? e.reason)));
    for (const level of ['error', 'warn'] as const) {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        note(`console.${level}`, args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a))).join(' '));
        orig(...args);
      };
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

  /** A network event worth keeping in the report (socket opened/closed, reconnect, host change). */
  event(text: string): void {
    this.errors.push(`${(performance.now() / 1000).toFixed(1)}s net: ${text}`.slice(0, 600));
    if (this.errors.length > 80) this.errors.shift();
  }

  /** The local input left this many ms later than its slot in the 30 Hz schedule (a hitch on the page). */
  inputLate(ms: number): void {
    if (ms > this.lateMax) this.lateMax = ms;
    if (ms > this.totals.lateMax) this.totals.lateMax = ms;
  }

  /** Once per frame: where the local character is drawn. Counts steps against the direction of travel and keeps the speeds. */
  drawFrame(x: number, y: number, dt: number): void {
    if (Number.isFinite(this.lastX) && dt > 0 && dt < 0.25) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      const sp = Math.hypot(dx, dy) / dt;
      this.drawSpeeds.push(sp);
      this.totals.frames++;
      if (sp > this.totals.maxDrawSpeed) this.totals.maxDrawSpeed = sp;
      const t = this.totals.speeds;
      t.push(sp);
      if (t.length > 3000) t.shift();
      if (dx * this.lastDx + dy * this.lastDy < 0 && Math.hypot(dx, dy) > 0.01 && Math.hypot(this.lastDx, this.lastDy) > 0.01) {
        this.backward++;
        this.totals.backward++;
      }
      this.lastDx = dx;
      this.lastDy = dy;
    }
    this.lastX = x;
    this.lastY = y;
  }

  /** The prediction view was reset (the local character left the world for a moment). */
  drawReset(): void {
    this.lastX = NaN;
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
      backward: this.backward,
      drawP99: Math.round([...this.drawSpeeds].sort((a, b) => a - b)[Math.floor(this.drawSpeeds.length * 0.99)] ?? 0),
      corrections: (info.corrections ?? 0) - this.lastCorr,
      snaps: (info.snaps ?? 0) - this.lastSnaps,
      maxErr: Math.round((info.maxErr ?? 0) * 100) / 100,
      lead: info.lead ?? 0,
      lateMax: Math.round(this.lateMax),
      coalesced: this.coalesced - this.coalescedSec,
    });
    this.totals.corrections = info.corrections ?? 0;
    this.totals.snaps = info.snaps ?? 0;
    this.lastCorr = info.corrections ?? 0;
    this.lastSnaps = info.snaps ?? 0;
    this.coalescedSec = this.coalesced;
    this.drawSpeeds = [];
    this.backward = 0;
    this.lateMax = 0;
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
    const errs = this.errors.length ? this.errors.map((e) => `  ${e}`).join('\n') : '  none';
    return `${head}\nerrors and warnings:\n${errs}\n\nstalls (> ${STALL_MS} ms):\n${stalls}\n\nper second:\n${rows}\n`;
  }
}
