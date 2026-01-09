import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LocationModule } from '../location/location.module';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { BreakController } from './break.controller';
import { Break, BreakSchema } from './break.schema';
import { BreakService } from './break.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Break.name, BreakSchema),
    ]),
    WebSocketModule,
    LocationModule,
    UserModule,
  ],
  controllers: [BreakController],
  providers: [BreakService],
  exports: [BreakService],
})
export class BreakModule {}
