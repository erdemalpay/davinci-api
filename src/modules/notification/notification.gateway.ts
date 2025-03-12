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

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('NotificationGateway');

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

  emitNotificationChanged(
    notification: any,
    selectedUsers?: string[],
    selectedRoles?: number[],
    selectedLocations?: number[],
  ) {
    this.server.emit('notificationChanged', {
      notification: notification,
      selectedUsers: selectedUsers ?? [],
      selectedRoles: selectedRoles ?? [],
      selectedLocations: selectedLocations ?? [],
    });
  }

  emitNotificationRemoved(
    notification: any,
    selectedUsers?: string[],
    selectedRoles?: number[],
    selectedLocations?: number[],
  ) {
    this.server.emit('notificationRemoved', {
      notification: notification,
      selectedUsers: selectedUsers ?? [],
      selectedRoles: selectedRoles ?? [],
      selectedLocations: selectedLocations ?? [],
    });
  }
}
