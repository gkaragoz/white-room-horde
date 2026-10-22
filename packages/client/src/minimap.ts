import {
  ARENA_HALF_H,
  ARENA_HALF_W,
  MAPS,
  MAX_ENEMIES,
  MAX_PICKUPS,
  MAX_PLAYERS,
  PlayerState,
} from '@wrh/shared';
import type { World } from '@wrh/sim';

/** The radar in the corner of the HUD: it draws onto the canvas `find` returns, in the colour `color` gives each player. */
export class Minimap {
  private canvas: HTMLCanvasElement | null = null;
  private last = 0;

  constructor(
    private readonly find: () => HTMLCanvasElement | null,
    private readonly color: (slot: number) => string,
  ) {}

  /** Radar of the whole arena: cover, enemies, loot and the squad (about 12 Hz). */
  draw(world: World, slot: number, now: number): void {
    if (now - this.last < 80) return;
    this.last = now;
    this.canvas ??= this.find();
    const c = this.canvas;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const sx = W / (ARENA_HALF_W * 2);
    const sy = H / (ARENA_HALF_H * 2);
    const X = (x: number): number => (x + ARENA_HALF_W) * sx;
    const Y = (y: number): number => (ARENA_HALF_H - y) * sy;
    g.clearRect(0, 0, W, H);
    const mapDef = MAPS[world.map] ?? MAPS[0]!;
    // decks lighter, ramps with a gradient that runs up to the high end
    g.fillStyle = 'rgba(214,196,160,0.75)';
    for (const d of mapDef.decks ?? []) g.fillRect(X(d.x - d.w / 2), Y(d.y + d.h / 2), d.w * sx, d.h * sy);
    for (const r of mapDef.ramps ?? []) {
      const x0 = X(r.x - r.w / 2);
      const y0 = Y(r.y + r.h / 2);
      const grad = g.createLinearGradient(
        r.dir === 0 ? x0 : r.dir === 2 ? x0 + r.w * sx : x0,
        r.dir === 1 ? y0 + r.h * sy : r.dir === 3 ? y0 : y0,
        r.dir === 0 ? x0 + r.w * sx : r.dir === 2 ? x0 : x0,
        r.dir === 1 ? y0 : r.dir === 3 ? y0 + r.h * sy : y0,
      );
      grad.addColorStop(0, 'rgba(242,200,121,0.2)');
      grad.addColorStop(1, 'rgba(242,166,70,1)');
      g.fillStyle = grad;
      g.fillRect(x0, y0, r.w * sx, r.h * sy);
    }
    g.fillStyle = '#8b7a5e';
    for (const o of mapDef.boxes) {
      if (o.kind === 'rail' || o.kind === 'rampwall') continue;
      g.fillRect(X(o.x - o.w / 2), Y(o.y + o.h / 2), o.w * sx, o.h * sy);
    }
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!world.kActive[i]) continue;
      g.fillStyle = ['#ffcf3a', '#3ddc6a', '#6b8f4a', '#c06bff'][world.kType[i]!]!;
      g.fillRect(X(world.kX[i]!) - 3, Y(world.kY[i]!) - 3, 6, 6);
    }
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!world.eActive[i]) continue;
      const boss = world.eBoss[i] !== 0;
      g.fillStyle = boss ? '#d8362e' : '#c0443c';
      const r = boss ? 7 : 2.2;
      g.beginPath();
      g.arc(X(world.eX[i]!), Y(world.eY[i]!), r, 0, Math.PI * 2);
      if (world.eLayer[i] === 1) {
        // on a deck: drawn as a ring
        g.strokeStyle = g.fillStyle as string;
        g.lineWidth = 1.4;
        g.stroke();
      } else g.fill();
    }
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!world.pActive[s] || world.pState[s] === PlayerState.Dead) continue;
      g.fillStyle = this.color(s);
      g.strokeStyle = s === slot ? '#fff' : '#3a352d';
      g.lineWidth = s === slot ? 3 : 1.5;
      g.beginPath();
      g.arc(X(world.pX[s]!), Y(world.pY[s]!), s === slot ? 6 : 4.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
}
