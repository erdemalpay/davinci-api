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

  emitFixtureCountChanged(user: User, fixtureCount: any) {
    this.server.emit('FixtureCountChanged', { user, fixtureCount });
  }

  emitFixtureInvoiceChanged(user: User, fixtureInvoice: any) {
    this.server.emit('FixtureInvoiceChanged', { user, fixtureInvoice });
  }

  emitFixtureCountListChanged(user: User, fixtureCountList: any) {
    this.server.emit('FixtureCountListChanged', { user, fixtureCountList });
  }

  emitInvoiceChanged(user: User, invoice: any) {
    this.server.emit('InvoiceChanged', { user, invoice });
  }

  emitPackageTypeChanged(user: User, packageType: any) {
    this.server.emit('PackageTypeChanged', { user, packageType });
  }

  emitPaymentChanged(user: User, payment: any) {
    this.server.emit('PaymentChanged', { user, payment });
  }

  emitPaymentMethodChanged(user: User, paymentMethod: any) {
    this.server.emit('PaymentMethodChanged', { user, paymentMethod });
  }

  emitProductChanged(user: User, product: any) {
    this.server.emit('ProductChanged', { user, product });
  }

  emitProductStockHistoryChanged(user: User, productStockHistory: any) {
    this.server.emit('ProductStockHistoryChanged', {
      user,
      productStockHistory,
    });
  }

  emitServiceChanged(user: User, service: any) {
    this.server.emit('ServiceChanged', { user, service });
  }

  emitServiceInvoiceChanged(user: User, serviceInvoice: any) {
    this.server.emit('ServiceInvoiceChanged', { user, serviceInvoice });
  }

  emitStockChanged(user: User, stock: any) {
    this.server.emit('StockChanged', { user, stock });
  }

  emitStockLocationChanged(user: User, stockLocation: any) {
    this.server.emit('StockLocationChanged', { user, stockLocation });
  }

  emitUnitChanged(user: User, unit: any) {
    this.server.emit('UnitChanged', { user, unit });
  }

  emitVendorChanged(user: User, vendor: any) {
    this.server.emit('VendorChanged', { user, vendor });
  }
}
