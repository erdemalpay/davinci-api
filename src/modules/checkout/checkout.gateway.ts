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
export class CheckoutGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('CheckoutGateway');

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

  emitCheckoutChanged(user: User, checkout: any) {
    this.server.emit('CheckoutChanged', { checkout: checkout });
  }

  emitIncomeChanged(user: User, income: any) {
    this.server.emit('CheckoutChanged', { income: income });
  }

  emitCashoutChanged(user: User, cashout: any) {
    this.server.emit('CheckoutChanged', { cashout: cashout });
  }

  emitCheckoutControlChanged(user: User, checkoutControl: any) {
    this.server.emit('CheckoutControlChanged', {
      user,
      checkoutControl,
    });
  }
}
