import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { UserModule } from '../user/user.module';
import { ButtonCallController } from './buttonCall.controller';
import { ButtonCallService } from './buttonCall.service';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
]);

@Module({
  imports: [
    WebSocketModule,mongooseModule, UserModule, HttpModule],
  providers: [ButtonCallService],
  exports: [ButtonCallService],
  controllers: [ButtonCallController],
})
export class ButtonCallModule {}
