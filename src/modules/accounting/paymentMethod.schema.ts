import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class PaymentMethod extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);

purifySchema(PaymentMethodSchema);
