import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { LocationModule } from '../location/location.module';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { MiddlemanController } from './middleman.controller';
import { Middleman, MiddlemanSchema } from './middleman.schema';
import { MiddlemanService } from './middleman.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
    ]),
    WebSocketModule,
    LocationModule,
    UserModule,
    ActivityModule,
  ],
  controllers: [MiddlemanController],
  providers: [MiddlemanService],
  exports: [MiddlemanService],
})
export class MiddlemanModule {}