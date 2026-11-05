import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateEventQrDto, UpdateEventQrDto } from './event-qr.dto';
import { EventQr } from './event-qr.schema';

@Injectable()
export class EventQrService {
  constructor(
    @InjectModel(EventQr.name) private readonly eventQrModel: Model<EventQr>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findAll() {
    return this.eventQrModel.find().sort({ _id: -1 }).exec();
  }

  // Herkese açık sayfa: etkinlik günü başladıysa ya da başlık/link boşsa null; tarih sunucuda İstanbul gününe göre bakılır
  async findLatest() {
    const latest = await this.eventQrModel
      .findOne()
      .sort({ _id: -1 })
      .lean()
      .exec();
    if (!latest?.title || !latest.url) return null;
    const today = moment.tz('Europe/Istanbul').format('YYYY-MM-DD');
    if (latest.date && latest.date <= today) return null;
    return { title: latest.title, url: latest.url };
  }

  async create(dto: CreateEventQrDto) {
    const eventQr = await this.eventQrModel.create(dto);
    this.websocketGateway.emitEventQrChanged();
    return eventQr;
  }

  async update(id: number, dto: UpdateEventQrDto) {
    const eventQr = await this.eventQrModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    this.websocketGateway.emitEventQrChanged();
    return eventQr;
  }
}
