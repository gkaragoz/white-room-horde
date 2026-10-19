/** Prefix a public asset path with the site's base URL (the game also lives under /white-room-horde/ on GitHub Pages). */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
