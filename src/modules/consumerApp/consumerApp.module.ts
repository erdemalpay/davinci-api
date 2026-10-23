import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ConsumerModule } from '../consumer/consumer.module';
import { TableModule } from '../table/table.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { ConsumerAppController } from './consumerApp.controller';
import {
  GameplayResult,
  GameplayResultSchema,
  TableCheckIn,
  TableCheckInSchema,
} from './consumerApp.schema';
import { ConsumerAppService } from './consumerApp.service';
import { ConsumerAuthGuard } from './consumerAuth.guard';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(TableCheckIn.name, TableCheckInSchema),
  createAutoIncrementConfig(GameplayResult.name, GameplayResultSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    ConsumerModule,
    TableModule,
    // Tokens are signed and checked with JWT_SECRET passed per call.
    JwtModule.register({}),
  ],
  controllers: [ConsumerAppController],
  providers: [ConsumerAppService, ConsumerAuthGuard],
})
export class ConsumerAppModule {}
