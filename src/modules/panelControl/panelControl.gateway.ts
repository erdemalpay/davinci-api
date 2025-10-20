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
export class PanelControlGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('PanelControlGateway');

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

  emitPageChanged(user: User, page: any) {
    this.server.emit('pageChanged', { user, page });
  }

  emitPanelControlChanged(user: User, panelControl: any) {
    this.server.emit('panelControlChanged', { user, panelControl });
  }
  emitPanelSettingsChanged(user: User, panelSettings: any) {
    this.server.emit('panelSettingsChanged', { user, panelSettings });
  }
  emitDisabledConditionChanged(user: User, disabledCondition: any) {
    this.server.emit('disabledConditionChanged', { user, disabledCondition });
  }
  emitActionChanged(action: any) {
    this.server.emit('actionChanged', { action });
  }
  emitTaskTrackChanged(taskTrack: any) {
    this.server.emit('taskTrackChanged', { taskTrack });
  }
}
