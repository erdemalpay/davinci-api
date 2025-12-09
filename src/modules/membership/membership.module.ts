import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { RedisModule } from '../redis/redis.module';
import { MembershipController } from './membership.controller';
import { Membership, MembershipSchema } from './membership.schema';
import { MembershipService } from './membership.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Membership.name, MembershipSchema),
]);

@Module({
  imports: [WebSocketModule, RedisModule, mongooseModule],
  providers: [MembershipService],
  exports: [MembershipService],
  controllers: [MembershipController],
})
export class MembershipModule {}
