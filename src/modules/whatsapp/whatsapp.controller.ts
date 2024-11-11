import { Body, Controller, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send')
  async sendMessage(
    @Body('recipient') recipient: string,
    @Body('message') message: string,
  ) {
    return await this.whatsappService.sendMessage(recipient, message);
  }
}
