import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class PaymentMethod extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  isConstant: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  isOnlineOrder: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);

purifySchema(PaymentMethodSchema);
