// Cut a release: bump the version, move the CHANGELOG "Unreleased" notes under the new version, commit and tag.
//
//   pnpm release patch | minor | major | 1.2.3        [--dry]
//
// Then `git push --follow-tags`: the "release" workflow builds the game and publishes the GitHub release with the zip.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkgPath = resolve(root, 'package.json');
const logPath = resolve(root, 'CHANGELOG.md');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const what = args.find((a) => !a.startsWith('--')) ?? 'patch';

export function bump(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump "${kind}" (use patch, minor, major or x.y.z)`);
}

/** Move the "Unreleased" section under a dated heading for `version` and leave an empty Unreleased on top. */
export function rollChangelog(text, version, date) {
  const marker = '## Unreleased';
  const at = text.indexOf(marker);
  if (at < 0) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  const after = text.slice(at + marker.length);
  const next = after.search(/\n## /);
  const body = (next < 0 ? after : after.slice(0, next)).trim();
  if (!body) throw new Error('the Unreleased section of CHANGELOG.md is empty: write what changed first');
  const rest = next < 0 ? '' : after.slice(next);
  return `${text.slice(0, at)}${marker}\n\n## v${version} (${date})\n\n${body}\n${rest}`;
}

const sh = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = bump(pkg.version, what);
const date = new Date().toISOString().slice(0, 10);
const log = rollChangelog(readFileSync(logPath, 'utf8'), version, date);

if (!dry) {
  if (sh('git status --porcelain')) throw new Error('the working tree has uncommitted changes: commit or stash them first');
  if (sh(`git tag --list v${version}`)) throw new Error(`tag v${version} already exists`);
}
console.log(`${pkg.version} -> ${version} (${date})${dry ? ' [dry run, nothing written]' : ''}`);
if (dry) process.exit(0);

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(logPath, log);
sh(`git add package.json CHANGELOG.md`);
sh(`git commit -m "Release v${version}"`);
sh(`git tag -a v${version} -m "white-room-horde v${version}"`);
console.log(`committed and tagged v${version}. Publish it with:\n  git push --follow-tags`);
