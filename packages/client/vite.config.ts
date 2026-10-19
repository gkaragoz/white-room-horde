import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// build info shown on screen: version from the root package.json, short commit, build time
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string };
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    return 'dev';
  }
}

/** Lists every model, picture and sound in the build with its size, for the loading screen's kilobyte counter. */
function assetManifest(): Plugin {
  return {
    name: 'wrh-asset-manifest',
    apply: 'build',
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      const files: { p: string; s: number }[] = [];
      const walk = (dir: string, rel: string): void => {
        for (const name of readdirSync(dir).sort()) {
          const full = resolve(dir, name);
          const r = rel ? `${rel}/${name}` : name;
          if (statSync(full).isDirectory()) walk(full, r);
          else if (!name.endsWith('.meta.json') && !name.endsWith('.md')) files.push({ p: r, s: statSync(full).size });
        }
      };
      for (const d of ['models', 'cards', 'sfx', 'music']) {
        try {
          walk(resolve(out, d), d);
        } catch {
          /* folder not in this build */
        }
      }
      writeFileSync(resolve(out, 'asset-manifest.json'), JSON.stringify({ files }));
    },
  };
}

export default defineConfig({
  plugins: [assetManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  // GitHub Pages serves the site from /white-room-horde/ (set BASE in CI); the Node server serves it from /
  base: process.env.BASE ?? '/',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), qa: resolve(__dirname, 'qa.html') } },
  },
});
