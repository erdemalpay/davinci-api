import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Fixture } from './fixture.schema';
import { StockLocation } from './stockLocation.schema';

@Schema({ _id: false })
export class FixtureStock extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: Fixture.name })
  fixture: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string | number;

  @Prop({ required: true, type: Number })
  quantity: number;
}

export const FixtureStockSchema = SchemaFactory.createForClass(FixtureStock);

purifySchema(FixtureStockSchema);
