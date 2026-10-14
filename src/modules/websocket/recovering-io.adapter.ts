import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

// How long a dropped client may come back and still get the events it
// missed (a phone locked for a minute, a short network loss).
export const MISSED_EVENTS_WINDOW_MS = 2 * 60 * 1000;

// Nest's IoAdapter builds its server with the socket.io copy bundled in
// @nestjs/platform-socket.io (4.5), which can't replay missed events. This
// one uses the app's socket.io (4.7) with connection state recovery: a
// client that reconnects within the window gets every event it missed,
// otherwise it reloads its data (socket.recovered is false).
export class RecoveringIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): Server {
    const serverOptions: Partial<ServerOptions> = {
      ...options,
      connectionStateRecovery: {
        maxDisconnectionDuration: MISSED_EVENTS_WINDOW_MS,
        skipMiddlewares: true,
      },
    };
    if (this.httpServer && port === 0) {
      return new Server(this.httpServer, serverOptions);
    }
    return new Server(port, serverOptions);
  }
}
