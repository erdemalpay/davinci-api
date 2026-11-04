import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { SaveEventQrDto } from './event-qr.dto';
import { EventQr, isEventQrVisible } from './event-qr.schema';

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
    const today = moment.tz('Europe/Istanbul').format('YYYY-MM-DD');
    if (!latest || !isEventQrVisible(latest, today)) return null;
    return { title: latest.title, url: latest.url };
  }

  async create(dto: SaveEventQrDto) {
    const eventQr = await this.eventQrModel.create(dto);
    this.websocketGateway.emitEventQrChanged();
    return eventQr;
  }

  async update(id: number, dto: SaveEventQrDto) {
    const eventQr = await this.eventQrModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    this.websocketGateway.emitEventQrChanged();
    return eventQr;
  }
}
