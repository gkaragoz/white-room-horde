/**
 * Health numbers of a tick loop for the /stats endpoint: how late the ticks run (ms behind schedule) over the last ten
 * seconds and how many messages come in per second. A relay that falls behind makes every player's game stutter, so this
 * is the first thing to look at when the host reports freezes.
 */
export class LoopStats {
  private readonly lags: number[] = [];
  private lastMessages = 0;
  private lastAt = 0;
  private rate = 0;
  worstLagMs = 0;

  /** Call once per executed tick with how far behind schedule it ran. */
  record(lagMs: number): void {
    this.lags.push(Math.max(0, lagMs));
    if (this.lags.length > 300) this.lags.shift();
    if (lagMs > this.worstLagMs) this.worstLagMs = lagMs;
  }

  snapshot(messages: number, nowMs: number): { tickLagAvgMs: number; tickLagMaxMs: number; worstLagMs: number; messagesPerSecond: number } {
    if (this.lastAt === 0 || nowMs - this.lastAt >= 1000) {
      if (this.lastAt !== 0) this.rate = ((messages - this.lastMessages) * 1000) / (nowMs - this.lastAt);
      this.lastMessages = messages;
      this.lastAt = nowMs;
    }
    const n = this.lags.length;
    const avg = n ? this.lags.reduce((a, b) => a + b, 0) / n : 0;
    return { tickLagAvgMs: Math.round(avg * 10) / 10, tickLagMaxMs: Math.round(Math.max(0, ...this.lags) * 10) / 10, worstLagMs: Math.round(this.worstLagMs), messagesPerSecond: Math.round(this.rate) };
  }
}
