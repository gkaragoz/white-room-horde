import { asset } from './assets';

/** Formats the browser can play, preferred first (the game ships both; Safari has no Vorbis). Shared with the audio bank. */
export const AUDIO_FORMATS: readonly string[] = (() => {
  try {
    return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
  } catch {
    return ['ogg', 'mp3'];
  }
})();

interface Manifest {
  files: { p: string; s: number }[];
}

const tr = navigator.language.startsWith('tr');
const kb = (bytes: number): string => Math.round(bytes / 1024).toLocaleString(tr ? 'tr-TR' : 'en-US');

function paint(done: number, total: number, note = ''): void {
  const bar = document.getElementById('wrh-load-bar');
  const text = document.getElementById('wrh-load-text');
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = note || `${kb(done)} KB / ${kb(total)} KB  (${pct}%)`;
}

/**
 * Download every model, picture and sound before the game starts, with a progress bar showing kilobytes loaded and in
 * total (the sizes come from `asset-manifest.json`, written at build time). The files land in the browser cache, so the
 * game's own loading afterwards is instant. Without a manifest (dev server) nothing happens.
 */
export async function preloadAssets(): Promise<void> {
  let manifest: Manifest;
  try {
    const res = await fetch(asset('asset-manifest.json'), { cache: 'no-store' });
    if (!res.ok) return;
    manifest = (await res.json()) as Manifest;
  } catch {
    return;
  }
  const ext = AUDIO_FORMATS[0]!;
  const list = manifest.files.filter((f) => {
    if (f.p.startsWith('sfx/') || f.p.startsWith('music/')) return f.p.endsWith('.' + ext);
    return true;
  });
  const total = list.reduce((a, f) => a + f.s, 0);
  let done = 0;
  paint(0, total);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const f = list[next++]!;
      let got = 0;
      try {
        const res = await fetch(asset(f.p));
        if (res.body) {
          const reader = res.body.getReader();
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            got += value.byteLength;
            done += value.byteLength;
            paint(done, total);
          }
        } else {
          got = (await res.arrayBuffer()).byteLength;
          done += got;
        }
      } catch {
        /* a missing file is handled by the game itself later */
      }
      // keep the bar honest when the real size differs from the manifest
      done += f.s - got > 0 && got === 0 ? f.s : 0;
      paint(done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  paint(total, total, tr ? 'Arena hazırlanıyor...' : 'Preparing the arena...');
}

/** Fade the loading screen away (the page's own markup lives in index.html). */
export function hideLoading(): void {
  const el = document.getElementById('wrh-loading');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 450);
}
