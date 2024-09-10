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
export class AccountingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AccountingGateway');

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

  emitBrandChanged(user: User, brand: any) {
    this.server.emit('BrandChanged', { user, brand });
  }

  emitCountChanged(user: User, count: any) {
    this.server.emit('CountChanged', { user, count });
  }

  emitCountListChanged(user: User, countList: any) {
    this.server.emit('CountListChanged', { user, countList });
  }

  emitExpenseTypeChanged(user: User, expenseType: any) {
    this.server.emit('ExpenseTypeChanged', { user, expenseType });
  }

  emitFixtureChanged(user: User, fixture: any) {
    this.server.emit('FixtureChanged', { user, fixture });
  }
}
