// Checks the built client (packages/client/dist): the PWA files are there and the download stays within budget.
//
//   pnpm --filter @wrh/client build && node tools/ci/check-dist.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('../../packages/client/dist', import.meta.url)));
const problems = [];
const need = (f) => {
  if (!existsSync(join(dist, f))) problems.push(`missing ${f}`);
};
['index.html', 'qa.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'asset-manifest.json'].forEach(need);

const html = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
if (!/rel="manifest"/.test(html)) problems.push('index.html does not link the manifest');
if (!/wrh-loading/.test(html)) problems.push('index.html has no loading screen');
if (/__VERSION__/.test(html) || !/wrh-load-sub[^<]*v\d+\.\d+\.\d+/.test(html)) problems.push('the loading screen does not show the version');

const manifest = JSON.parse(readFileSync(join(dist, 'asset-manifest.json'), 'utf8'));
const total = manifest.files.reduce((a, f) => a + f.s, 0);
const ogg = manifest.files.filter((f) => f.p.startsWith('sfx/') || f.p.startsWith('music/')).filter((f) => f.p.endsWith('.ogg')).reduce((a, f) => a + f.s, 0);
const mp3 = manifest.files.filter((f) => f.p.startsWith('sfx/') || f.p.startsWith('music/')).filter((f) => f.p.endsWith('.mp3')).reduce((a, f) => a + f.s, 0);
const nonAudio = manifest.files.filter((f) => !f.p.startsWith('sfx/') && !f.p.startsWith('music/')).reduce((a, f) => a + f.s, 0);
const oneFormat = nonAudio + Math.max(ogg, mp3); // what a player downloads (one audio format)

const jsBytes = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .reduce((a, f) => a + statSync(join(dist, 'assets', f)).size, 0);

const MB = 1024 * 1024;
const BUDGET = { download: 52 * MB, scripts: 3 * MB }; // (the ten newer enemies and two bosses added about 11 MB of baked animation, ten more enemies and five bosses another 12)
if (oneFormat > BUDGET.download) problems.push(`first download is ${(oneFormat / MB).toFixed(1)} MB, budget ${BUDGET.download / MB} MB`);
if (jsBytes > BUDGET.scripts) problems.push(`scripts are ${(jsBytes / MB).toFixed(1)} MB, budget ${BUDGET.scripts / MB} MB`);

console.log(`assets ${(total / MB).toFixed(1)} MB on disk, first download ${(oneFormat / MB).toFixed(1)} MB (budget ${BUDGET.download / MB}), scripts ${(jsBytes / MB).toFixed(2)} MB (budget ${BUDGET.scripts / MB})`);
if (problems.length) {
  console.error('FAIL ' + problems.join('; '));
  process.exit(1);
}
console.log('PASS dist is complete and within budget');
