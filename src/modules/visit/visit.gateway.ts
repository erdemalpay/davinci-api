import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { User } from '../user/user.schema';

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class VisitGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('VisitGateway');

  afterInit(server: Server) {
    this.logger.log('Init');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  @SubscribeMessage('msgToServer')
  handleMessage(client: Socket, payload: string): string {
    return 'Hello world!';
  }

  emitVisitChanged(user: User, visit: any) {
    this.server.emit('visitChanged', { user, visit });
  }

  emitCafeActivityChanged(activity: any) {
    this.server.emit('cafeActivityChanged', activity);
  }
}
