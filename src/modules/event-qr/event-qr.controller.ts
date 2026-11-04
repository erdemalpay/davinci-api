import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SaveEventQrDto } from './event-qr.dto';
import { EventQrService } from './event-qr.service';

@Controller('/event-qr')
export class EventQrController {
  constructor(private readonly eventQrService: EventQrService) {}

  @Public()
  @Get('/public')
  findPublic() {
    return this.eventQrService.findPublic();
  }

  @Get()
  find() {
    return this.eventQrService.find();
  }

  @Patch()
  save(@Body() dto: SaveEventQrDto) {
    return this.eventQrService.save(dto);
  }
}
