import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Consumer } from '../consumer/consumer.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Point extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: false, type: String, ref: User.name })
  user: string;

  @Prop({ required: false, type: Number, ref: Consumer.name })
  consumer: number;

  @Prop({ required: true, type: Number, default: 0 })
  amount: number;
}

export const PointSchema = SchemaFactory.createForClass(Point);

purifySchema(PointSchema);
