import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [WhatsappService, WhatsappGateway],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
