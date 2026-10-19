import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server';

/**
 * Game server: pnpm --filter @wrh/client build && pnpm --filter @wrh/server start
 * Environment: PORT (default 8787).
 */
const port = Number(process.env.PORT ?? 8787);
const staticRoot = resolve(fileURLToPath(new URL('../../client/dist', import.meta.url)));
const s = await startServer({ port, staticRoot });
console.log(`white-room-horde server on http://localhost:${s.port} (ws path /ws, static ${staticRoot})`);
