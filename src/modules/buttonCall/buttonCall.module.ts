import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';
import { ButtonCallService } from './buttonCall.service';
import { ButtonCallController } from './buttonCall.controller';
import { UserModule } from '../user/user.module';
import { ButtonCallGateway } from './buttonCall.gateway';
import { UdpModule } from '../udp/udp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ButtonCall.name, schema: ButtonCallSchema },
    ]),
    forwardRef(() => UdpModule),
    UserModule,
  ],
  providers: [
    ButtonCallService,
    ButtonCallGateway,
  ],
  exports: [
    ButtonCallService,
    MongooseModule.forFeature([
      { name: ButtonCall.name, schema: ButtonCallSchema },
    ]),
    ButtonCallGateway
  ],
  controllers: [
    ButtonCallController,
  ]
})
export class ButtonCallModule {}
