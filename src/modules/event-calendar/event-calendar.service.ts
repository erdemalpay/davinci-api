import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateEventCalendarDto,
  UpdateEventCalendarDto,
} from './event-calendar.dto';
import { EventCalendar } from './event-calendar.schema';

@Injectable()
export class EventCalendarService {
  constructor(
    @InjectModel(EventCalendar.name)
    private readonly eventCalendarModel: Model<EventCalendar>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findAll() {
    return this.eventCalendarModel.find().sort({ _id: -1 }).exec();
  }

  // Herkese açık sayfa: kayıt yoksa ya da satır yoksa null
  async findLatest() {
    const latest = await this.eventCalendarModel
      .findOne()
      .sort({ _id: -1 })
      .lean()
      .exec();
    if (!latest?.items?.length) return null;
    return {
      title: latest.title,
      items: latest.items,
      hasQr: latest.hasQr !== false,
    };
  }

  async create(dto: CreateEventCalendarDto) {
    const eventCalendar = await this.eventCalendarModel.create(dto);
    this.websocketGateway.emitEventCalendarChanged();
    return eventCalendar;
  }

  async update(id: number, dto: UpdateEventCalendarDto) {
    const eventCalendar = await this.eventCalendarModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    this.websocketGateway.emitEventCalendarChanged();
    return eventCalendar;
  }
}
