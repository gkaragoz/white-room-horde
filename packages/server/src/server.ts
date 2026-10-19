import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { TICK_DT } from '@wrh/shared';
import { RoomManager, type Conn, type ManagerOptions } from '@wrh/net';
import { WebSocketServer } from 'ws';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.ogg': 'audio/ogg',
};

export interface RunningServer {
  http: Server;
  manager: RoomManager;
  port: number;
  close(): Promise<void>;
}

/**
 * Relay/sequencer for rooms (docs/DESIGN.md section 8) plus a static file server for the built client, so one process
 * (and one tunnel) is enough. `port: 0` picks a free port (used by the end-to-end test).
 */
export async function startServer(opts: { port: number; staticRoot?: string; manager?: ManagerOptions }): Promise<RunningServer> {
  const root = opts.staticRoot ?? '';
  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path === '/' || path === '\\') path = '/index.html';
    const file = join(root, path);
    if (!root || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  const manager = new RoomManager(opts.manager);
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 2_100_000 });
  wss.on('connection', (ws) => {
    const conn: Conn = { send: (d) => ws.readyState === ws.OPEN && ws.send(d), close: () => ws.close() };
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
  const timer = setInterval(() => {
    const now = performance.now();
    if (now - nextTick > periodMs * 5) nextTick = now - periodMs * 5;
    while (now >= nextTick) {
      manager.tick();
      nextTick += periodMs;
    }
  }, 8);

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  return {
    http,
    manager,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        wss.clients.forEach((c) => c.terminate());
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
