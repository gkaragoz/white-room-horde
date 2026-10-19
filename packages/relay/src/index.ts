import { GAME_VERSION, TICK_DT } from '@wrh/shared';
import { RoomManager, type Conn } from '@wrh/net';

// Minimal shapes of the Workers runtime used here (the full types live in @cloudflare/workers-types).
interface WorkerSocket {
  accept(): void;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', fn: (ev: { data: string | ArrayBuffer }) => void): void;
  addEventListener(type: 'close' | 'error', fn: () => void): void;
}
declare const WebSocketPair: new () => { 0: WorkerSocket; 1: WorkerSocket };
interface Stub {
  fetch(req: Request): Promise<Response>;
}
interface Env {
  HUB: { idFromName(name: string): unknown; get(id: unknown): Stub };
}

/**
 * One Durable Object holds every room: the same RoomManager the Node server runs, ticking at the simulation rate while
 * anyone is connected. /version.json mirrors the Node server so the menu can check that the relay is alive.
 */
export class Hub {
  private readonly manager = new RoomManager();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sockets = 0;
  private nextTick = 0;

  private startTicking(): void {
    if (this.timer) return;
    const period = TICK_DT * 1000;
    this.nextTick = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      if (now - this.nextTick > period * 5) this.nextTick = now - period * 5;
      while (now >= this.nextTick) {
        this.manager.tick();
        this.nextTick += period;
      }
    }, 8);
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  fetch(req: Request): Response {
    const url = new URL(req.url);
    const cors = { 'access-control-allow-origin': '*' };
    if (url.pathname === '/version.json') {
      return new Response(JSON.stringify({ version: GAME_VERSION, rooms: this.manager.rooms.size }), { headers: { 'content-type': 'application/json', ...cors } });
    }
    if (url.pathname !== '/ws' || req.headers.get('Upgrade') !== 'websocket') return new Response('white-room-horde relay', { headers: cors });
    const pair = new WebSocketPair();
    const client = pair[0];
    const ws = pair[1];
    ws.accept();
    const conn: Conn = { send: (d) => ws.send(d), close: () => ws.close(1000, 'closed') };
    this.sockets++;
    this.startTicking();
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') this.manager.handle(conn, ev.data);
      else this.manager.handle(conn, new Uint8Array(ev.data));
    });
    let gone = false;
    const leave = (): void => {
      if (gone) return;
      gone = true;
      this.manager.close(conn);
      if (--this.sockets <= 0) this.stopTicking();
    };
    ws.addEventListener('close', leave);
    ws.addEventListener('error', leave);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return env.HUB.get(env.HUB.idFromName('main')).fetch(req);
  },
};
