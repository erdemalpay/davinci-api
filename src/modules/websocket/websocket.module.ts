import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../redis/redis.module';
import { AppWebSocketGateway } from './websocket.gateway';

@Module({
  // The customer app's token is checked with JWT_SECRET passed per call.
  imports: [RedisModule, JwtModule.register({})],
  providers: [AppWebSocketGateway],
  exports: [AppWebSocketGateway],
})
export class WebSocketModule {}
