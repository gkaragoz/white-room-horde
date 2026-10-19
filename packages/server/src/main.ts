import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICK_DT } from '@wrh/shared';
import { RoomManager, type Conn } from '@wrh/net';
import { WebSocketServer } from 'ws';

/**
 * Relay/sequencer for rooms: collects each player's tagged inputs and broadcasts the confirmed input bundle for every
 * tick (docs/DESIGN.md section 8). It also serves the built client so one process (and one tunnel) is enough:
 *   pnpm --filter @wrh/client build && pnpm --filter @wrh/server start
 */
const port = Number(process.env.PORT ?? 8787);
const root = resolve(fileURLToPath(new URL('../../client/dist', import.meta.url)));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
};

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(decodeURIComponent(url.pathname));
  if (path === '/' || path === '\\') path = '/index.html';
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const manager = new RoomManager();
const wss = new WebSocketServer({ server: http, path: '/ws' });
wss.on('connection', (ws) => {
  const conn: Conn = { send: (d) => ws.readyState === ws.OPEN && ws.send(d) };
  ws.on('message', (data, isBinary) => {
    if (isBinary) manager.handle(conn, new Uint8Array(data as Buffer));
    else manager.handle(conn, data.toString());
  });
  ws.on('close', () => manager.close(conn));
  ws.on('error', () => manager.close(conn));
});

// fixed-rate ticking with catch-up so timer jitter does not slow the game
const periodMs = TICK_DT * 1000;
let nextTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (now - nextTick > periodMs * 5) nextTick = now - periodMs * 5;
  while (now >= nextTick) {
    manager.tick();
    nextTick += periodMs;
  }
}, 8);
http.listen(port, () => console.log(`white-room-horde server on http://localhost:${port} (ws path /ws, static ${root})`));
