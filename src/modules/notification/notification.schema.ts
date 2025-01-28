import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Notification extends Document {
  @Prop({ type: Number })
  _id: number;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

purifySchema(NotificationSchema);
