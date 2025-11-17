import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { AppWebSocketGateway } from './websocket.gateway';

@Module({
  imports: [RedisModule],
  providers: [AppWebSocketGateway],
  exports: [AppWebSocketGateway],
})
export class WebSocketModule {}
