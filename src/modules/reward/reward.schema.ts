import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Reward extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ required: true })
  used: boolean;
}

export const RewardSchema = SchemaFactory.createForClass(Reward);

purifySchema(RewardSchema);
