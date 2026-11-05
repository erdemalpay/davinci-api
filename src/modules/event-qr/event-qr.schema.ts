import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

// Kasadaki QR sayfasının ek butonu; en son kayıt (en büyük _id) geçerlidir
@Schema({ _id: false, timestamps: true })
export class EventQr extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, default: '' })
  url: string;

  // Etkinlik günü "YYYY-MM-DD" (İstanbul); o günün 00:00'ında gizlenir, boşsa süresiz
  @Prop({ type: String, default: '' })
  date: string;
}

export const EventQrSchema = SchemaFactory.createForClass(EventQr);
purifySchema(EventQrSchema);
