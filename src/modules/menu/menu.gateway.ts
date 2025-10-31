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
import { User } from '../user/user.schema';
@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MenuGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('MenuGateway');
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

  async emitItemChanged(user?: User, item?: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('itemChanged', { user, item });
  }

  emitPopularChanged(user: User, popular: any) {
    this.server.emit('popularChanged', { user, popular });
  }

  emitKitchenChanged(user: User, kitchen: any) {
    this.server.emit('kitchenChanged', { user, kitchen });
  }

  async emitCategoryChanged(user: User, category: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.MenuCategories);
    await this.redisService.reset(RedisKeys.ActiveMenuCategories);
    this.server.emit('categoryChanged', { user, category });
  }

  emitUpperCategoryChanged(user: User, upperCategory: any) {
    this.server.emit('upperCategoryChanged', { user, upperCategory });
  }
}
