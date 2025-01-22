import { forwardRef, Module } from '@nestjs/common';
import { UdpService } from './udp.service';
import { ButtonCallModule } from '../buttonCall/buttonCall.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    forwardRef(() => ButtonCallModule),
    UserModule,
  ],
  providers: [UdpService],
  exports: [UdpService],
})
export class UdpModule {}
