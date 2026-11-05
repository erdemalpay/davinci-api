import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  CreateEventCalendarDto,
  UpdateEventCalendarDto,
} from './event-calendar.dto';
import { EventCalendarService } from './event-calendar.service';

@Controller('/event-calendar')
export class EventCalendarController {
  constructor(private readonly eventCalendarService: EventCalendarService) {}

  //bu endpointi panel kullanıyor.
  @Get()
  findAll() {
    return this.eventCalendarService.findAll();
  }

  //bu endpointi kasadaki QR'ın açtığı /events sayfası kullanıyor.
  @Public()
  @Get('/latest')
  findLatest() {
    return this.eventCalendarService.findLatest();
  }

  @Post()
  create(@Body() dto: CreateEventCalendarDto) {
    return this.eventCalendarService.create(dto);
  }

  @Patch('/:id')
  update(@Param('id') id: number, @Body() dto: UpdateEventCalendarDto) {
    return this.eventCalendarService.update(id, dto);
  }
}
