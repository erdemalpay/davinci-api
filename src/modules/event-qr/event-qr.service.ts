import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { SaveEventQrDto } from './event-qr.dto';
import { EVENT_QR_ID, EventQr, isEventQrVisible } from './event-qr.schema';

@Injectable()
export class EventQrService {
  constructor(
    @InjectModel(EventQr.name) private readonly eventQrModel: Model<EventQr>,
  ) {}

  find() {
    return this.eventQrModel.findById(EVENT_QR_ID).lean().exec();
  }

  save(dto: SaveEventQrDto) {
    return this.eventQrModel
      .findByIdAndUpdate(
        EVENT_QR_ID,
        {
          title: dto.title,
          url: dto.url,
          date: (dto.date ?? '').slice(0, 10),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }

  // Herkese açık sayfa: etkinlik günü başladıysa ya da başlık/link boşsa null; tarih sunucuda İstanbul gününe göre bakılır
  async findPublic() {
    const setting = await this.find();
    const today = moment.tz('Europe/Istanbul').format('YYYY-MM-DD');
    if (!setting || !isEventQrVisible(setting, today)) return null;
    return { title: setting.title, url: setting.url };
  }
}
