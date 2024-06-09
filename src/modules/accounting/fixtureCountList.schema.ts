import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Fixture } from './fixture.schema';
import { StockLocation } from './stockLocation.schema';

export class CountListsFixture {
  @Prop({ required: true, type: Number, ref: Fixture.name })
  fixture: string;

  @Prop({ required: true, type: [{ type: String, ref: StockLocation.name }] })
  locations: string[];
}

@Schema({ _id: false })
export class FixtureCountList extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: [{ type: String, ref: StockLocation.name }] })
  locations: string[];

  @Prop([CountListsFixture])
  fixtures: CountListsFixture[];
}

export const FixtureCountListSchema =
  SchemaFactory.createForClass(FixtureCountList);

purifySchema(FixtureCountListSchema);
