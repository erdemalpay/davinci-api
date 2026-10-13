import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { RecoveringIoAdapter } from './recovering-io.adapter';

// A real server and client: a client that drops and comes back gets the
// events it missed.
describe('RecoveringIoAdapter', () => {
  let httpServer: HttpServer;
  let server: Server;
  let client: Socket;

  beforeEach(async () => {
    httpServer = createServer();
    const adapter = new RecoveringIoAdapter(httpServer);
    server = adapter.createIOServer(0, { path: '/socket.io' } as never);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    client = io(`http://localhost:${port}`, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionDelay: 10,
    });
    await new Promise<void>((resolve) =>
      client.once('connect', () => resolve()),
    );
  });

  afterEach(async () => {
    client.disconnect();
    await new Promise((resolve) => server.close(resolve));
  });

  it('replays events emitted while the client was away', async () => {
    const received: string[] = [];
    client.on('orderUpdated', ({ id }: { id: string }) => received.push(id));

    // Something the server sends as the session starts, so it can be
    // resumed later.
    server.emit('orderUpdated', { id: 'before' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The phone loses the connection (not a deliberate disconnect).
    const disconnected = new Promise((resolve) =>
      client.once('disconnect', resolve),
    );
    const reconnected = new Promise<void>((resolve) =>
      client.io.once('reconnect', () => resolve()),
    );
    client.io.engine.close();
    await disconnected;
    server.emit('orderUpdated', { id: 'while-away' });

    await reconnected;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(client.recovered).toBe(true);
    expect(received).toEqual(['before', 'while-away']);
  });
});
