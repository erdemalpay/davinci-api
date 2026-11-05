import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

// Afişteki tek bir satır: sol rozet (1-3 satır yazı), başlık, açıklama ve ikon
export type EventCalendarItem = {
  // Rozet satırları: ["HER", "PAZARTESİ"] ya da ["15", "KASIM", "PAZAR"]
  badge: string[];
  // Rozet rengi "#RRGGBB"
  color: string;
  title: string;
  description: string;
  // Hazır ikon anahtarı ("meeple") ya da yüklenmiş görselin https adresi
  icon: string;
};

// Aylık etkinlik afişi; en son kayıt (en büyük _id) geçerlidir
@Schema({ _id: false, timestamps: true })
export class EventCalendar extends Document {
  @Prop({ type: Number })
  _id: number;

  // Afişin başlığı: "KASIM AYI ETKİNLİKLERİ"
  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: [Object], default: [] })
  items: EventCalendarItem[];

  // Afişte QR gösterilsin mi; eski kayıtlarda alan yoksa gösterilir
  @Prop({ type: Boolean, default: true })
  hasQr: boolean;
}

export const EventCalendarSchema = SchemaFactory.createForClass(EventCalendar);
purifySchema(EventCalendarSchema);
