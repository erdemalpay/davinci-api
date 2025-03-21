import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: { origin: true, credentials: true },
})
export class EducationGateway {
  @WebSocketServer() server: Server;
  // Base gateway with no functions.
}
