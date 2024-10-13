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
    this.server.emit('brandChanged', { user, brand });
  }

  emitCountChanged(user: User, count: any) {
    this.server.emit('countChanged', { user, count });
  }

  emitCountListChanged(user: User, countList: any) {
    this.server.emit('countListChanged', { user, countList });
  }

  emitExpenseTypeChanged(user: User, expenseType: any) {
    this.server.emit('expenseTypeChanged', { user, expenseType });
  }
  emitInvoiceChanged(user: User, invoice: any) {
    this.server.emit('invoiceChanged', { user, invoice });
  }

  emitPaymentChanged(user: User, payment: any) {
    this.server.emit('paymentChanged', { user, payment });
  }

  emitPaymentMethodChanged(user: User, paymentMethod: any) {
    this.server.emit('paymentMethodChanged', { user, paymentMethod });
  }

  emitProductChanged(user: User, product: any) {
    this.server.emit('productChanged', { user, product });
  }

  emitProductStockHistoryChanged(user: User, productStockHistory: any) {
    this.server.emit('productStockHistoryChanged', {
      user,
      productStockHistory,
    });
  }

  emitServiceChanged(user: User, service: any) {
    this.server.emit('serviceChanged', { user, service });
  }

  emitServiceInvoiceChanged(user: User, serviceInvoice: any) {
    this.server.emit('serviceInvoiceChanged', { user, serviceInvoice });
  }

  emitStockChanged(user: User, stock: any) {
    this.server.emit('stockChanged', { user, stock });
  }

  emitStockLocationChanged(user: User, stockLocation: any) {
    this.server.emit('stockLocationChanged', { user, stockLocation });
  }

  emitVendorChanged(user: User, vendor: any) {
    this.server.emit('vendorChanged', { user, vendor });
  }
}
