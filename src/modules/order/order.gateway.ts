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
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';
@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OrderGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('OrderGateway');
  constructor(private readonly redisService: RedisService) {}

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

  emitOrderCreated(socketUser: User, order: any) {
    this.server.emit('orderCreated', order);
  }

  emitOrderUpdated(socketUser: User, order: any) {
    this.server.emit('orderUpdated', { socketUser, order });
  }

  async emitDiscountChanged(socketUser: User, discount: any) {
    await this.redisService.reset(RedisKeys.Discounts);
    this.server.emit('discountChanged', { socketUser, discount });
  }

  emitCollectionChanged(socketUser: User, collection: any) {
    this.server.emit('collectionChanged', { socketUser, collection });
  }
  emitTodayOrdersChanged(socketUser: User) {
    this.server.emit('todayOrdersChanged', { socketUser });
  }
  emitOrderNotesChanged(socketUser?: User, orderNotes?: any) {
    this.server.emit('orderNotesChanged', { socketUser, orderNotes });
  }
  emitCreateMultipleOrder(
    socketUser: User,
    table: Table,
    location: number,
    soundRoles: any,
  ) {
    this.server.emit('createMultipleOrder', {
      socketUser,
      table,
      location,
      soundRoles,
    });
  }
  emitOrderGroupChanged() {
    this.server.emit('orderGroupChanged');
  }
}
