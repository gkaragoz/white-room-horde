/** Where the host publishes the address of the relay currently reachable from the internet (see tools/relay.mjs). */
export const RELAY_INDEX = 'https://raw.githubusercontent.com/gkaragoz/white-room-horde/main/relay.json';

export interface RelayInfo {
  /** wss:// address of the relay's websocket. */
  url: string;
  version: string;
  rooms: number;
}

/** Ask the published index for the public relay and check that it answers; null when there is none or it is down. */
export async function discoverRelay(index = RELAY_INDEX, timeoutMs = 5000): Promise<RelayInfo | null> {
  const get = async (url: string): Promise<unknown> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
      return r.ok ? await r.json() : null;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const idx = (await get(index)) as { url?: unknown } | null;
    if (!idx || typeof idx.url !== 'string' || !/^wss:\/\/[^/]+\/ws$/.test(idx.url)) return null;
    const health = (await get(idx.url.replace(/^wss:/, 'https:').replace(/\/ws$/, '/version.json'))) as { version?: unknown; rooms?: unknown } | null;
    if (!health || typeof health.version !== 'string') return null;
    return { url: idx.url, version: health.version, rooms: typeof health.rooms === 'number' ? health.rooms : 0 };
  } catch {
    return null;
  }
}
