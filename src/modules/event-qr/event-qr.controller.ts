import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SaveEventQrDto } from './event-qr.dto';
import { EventQrService } from './event-qr.service';

@Controller('/event-qr')
export class EventQrController {
  constructor(private readonly eventQrService: EventQrService) {}

  //bu endpointi panel kullanıyor.
  @Get()
  findAll() {
    return this.eventQrService.findAll();
  }

  //bu endpointi kasadaki QR'ın açtığı /etkinlikler sayfası kullanıyor.
  @Public()
  @Get('/latest')
  findLatest() {
    return this.eventQrService.findLatest();
  }

  @Post()
  create(@Body() dto: SaveEventQrDto) {
    return this.eventQrService.create(dto);
  }

  @Patch('/:id')
  update(@Param('id') id: number, @Body() dto: SaveEventQrDto) {
    return this.eventQrService.update(id, dto);
  }
}
