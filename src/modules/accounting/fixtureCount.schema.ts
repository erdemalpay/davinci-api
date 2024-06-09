import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Fixture } from './fixture.schema';
import { FixtureCountList } from './fixtureCountList.schema';
import { StockLocation } from './stockLocation.schema';

class CountFixture {
  @Prop({ required: true, type: Number, ref: Fixture.name })
  fixture: Fixture;

  @Prop({ required: true, type: Number })
  stockQuantity: number;

  @Prop({ required: true, type: Number })
  countQuantity: number;
}

@Schema({ _id: false })
export class FixtureCount extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string;

  @Prop({ required: true, type: String, ref: FixtureCountList.name })
  countList: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: false, type: Date })
  completedAt: Date;

  @Prop({ required: true })
  isCompleted: boolean;

  @Prop([CountFixture])
  fixtures: CountFixture[];
}

export const FixtureCountSchema = SchemaFactory.createForClass(FixtureCount);

purifySchema(FixtureCountSchema);

// TODO: Status enum will be added
