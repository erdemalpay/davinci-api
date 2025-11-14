import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Point extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: User.name })
  user: number;

  @Prop({ required: true, type: Number, default: 0 })
  amount: number;
}

export const PointSchema = SchemaFactory.createForClass(Point);

purifySchema(PointSchema);
