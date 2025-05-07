import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { UserModule } from '../user/user.module';
import { ButtonCallController } from './buttonCall.controller';
import { ButtonCallGateway } from './buttonCall.gateway';
import { ButtonCallService } from './buttonCall.service';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
]);

@Module({
  imports: [mongooseModule, UserModule, HttpModule],
  providers: [ButtonCallService, ButtonCallGateway],
  exports: [ButtonCallService],
  controllers: [ButtonCallController],
})
export class ButtonCallModule {}
