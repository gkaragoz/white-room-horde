/**
 * A steady 30 Hz timer that keeps running when the page is in the background or the frame rate drops: browsers slow
 * `requestAnimationFrame` and page timers down to a crawl for hidden or covered tabs, and a player whose inputs stop
 * arriving looks frozen to everybody else. A dedicated worker's timer is not throttled that way.
 */
export class InputTimer {
  private worker: Worker | null = null;
  private url: string | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tick: () => void,
    private readonly periodMs = 1000 / 30,
  ) {}

  start(): void {
    if (this.worker || this.fallback !== null) return;
    try {
      const code = [
        'let next = performance.now();',
        `const period = ${this.periodMs};`,
        'function loop() {',
        '  const now = performance.now();',
        '  let n = 0;',
        '  while (next <= now && n < 3) { postMessage(0); next += period; n++; }',
        '  if (next < now - period * 3) next = now;',
        '  setTimeout(loop, Math.max(1, next - performance.now()));',
        '}',
        'loop();',
      ].join('\n');
      this.url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      this.worker = new Worker(this.url);
      this.worker.onmessage = () => this.tick();
    } catch {
      this.fallback = setInterval(this.tick, this.periodMs);
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (this.fallback !== null) clearInterval(this.fallback);
    this.fallback = null;
  }
}
