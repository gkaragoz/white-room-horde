import pkg from '../../../package.json';

/** The game version (the root package.json is the single source of truth, see tools/release.mjs). */
export const GAME_VERSION: string = pkg.version;

/** "major.minor" - clients and servers must agree on it because the simulation rules can change between minors. */
export function simGeneration(version: string): string {
  const [major, minor] = version.split('.');
  return `${major ?? '0'}.${minor ?? '0'}`;
}

export function compatibleVersions(a: string, b: string): boolean {
  return simGeneration(a) === simGeneration(b);
}
