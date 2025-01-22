import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { UdpModule } from '../udp/udp.module';
import { UserModule } from '../user/user.module';
import { ButtonCallController } from './buttonCall.controller';
import { ButtonCallGateway } from './buttonCall.gateway';
import { ButtonCallService } from './buttonCall.service';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
]);

@Module({
  imports: [mongooseModule, forwardRef(() => UdpModule), UserModule],
  providers: [ButtonCallService, ButtonCallGateway],
  exports: [ButtonCallService, ButtonCallGateway],
  controllers: [ButtonCallController],
})
export class ButtonCallModule {}
