import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ChatDto } from './game-assistant.dto';
import { GameAssistantService } from './game-assistant.service';

// Sunucu nginx arkasında; gerçek istemci IP'si x-forwarded-for'un ilk değeri.
const clientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(
    ',',
  )[0];
  return first?.trim() || req.ip;
};

@Controller('/game-assistant')
export class GameAssistantController {
  constructor(private readonly gameAssistantService: GameAssistantService) {}

  // Bu endpointi Oyun Var mı sitesindeki sohbet kutusu kullanıyor.
  @Public()
  @Post('/chat')
  chat(@Body() dto: ChatDto, @Req() req: Request) {
    return this.gameAssistantService.chat(dto, clientIp(req));
  }
}
