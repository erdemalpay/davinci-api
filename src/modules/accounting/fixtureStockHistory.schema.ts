import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Fixture } from './fixture.schema';
import { StockLocation } from './stockLocation.schema';

@Schema({ _id: false })
export class FixtureStockHistory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Fixture.name })
  fixture: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string | number;

  @Prop({ required: true, type: Number })
  change: number;

  @Prop({ required: true, type: Number })
  currentAmount: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export const FixtureStockHistorySchema =
  SchemaFactory.createForClass(FixtureStockHistory);

purifySchema(FixtureStockHistorySchema);
