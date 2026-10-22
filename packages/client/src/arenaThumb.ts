import { ARENA_HALF_H, ARENA_HALF_W, MAPS } from '@wrh/shared';
import { THEMES } from './render/arena';

const thumbCache = new Map<number, string>();

/** A little top-down picture of an arena layout, painted from the same data the game uses (cached as a data URL). */
export function arenaThumb(index: number): string {
  const hit = thumbCache.get(index);
  if (hit) return hit;
  const W = 240, H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return '';
  const s = W / (ARENA_HALF_W * 2);
  const X = (x: number): number => W / 2 + x * s;
  const Y = (y: number): number => H / 2 - y * s;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#e6ebf0');
  grad.addColorStop(1, '#d3dae2');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,135,150,.25)';
  g.lineWidth = 1;
  for (let x = -ARENA_HALF_W; x <= ARENA_HALF_W; x += 5) {
    g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke();
  }
  for (let y = -ARENA_HALF_H; y <= ARENA_HALF_H; y += 5) {
    g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke();
  }
  const theme = THEMES[index] ?? THEMES[0]!;
  for (const b of MAPS[index]?.boxes ?? []) {
    const x = X(b.x - b.w / 2), y = Y(b.y + b.h / 2), w = b.w * s, h = b.h * s;
    g.fillStyle = 'rgba(40,50,65,.28)';
    g.fillRect(x + 2.5, y + 3, w, h); // shadow
    g.fillStyle = theme.side;
    g.fillRect(x, y + 2, w, h); // front face
    g.fillStyle = theme.top;
    g.fillRect(x, y, w, h);
    g.strokeStyle = theme.rim;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  // the barrier fence around the floor
  g.strokeStyle = '#7d8896';
  g.lineWidth = 5;
  g.setLineDash([9, 4]);
  g.strokeRect(2.5, 2.5, W - 5, H - 5);
  g.setLineDash([]);
  const url = c.toDataURL('image/png');
  thumbCache.set(index, url);
  return url;
}
