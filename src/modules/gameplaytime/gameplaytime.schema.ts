import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false, timestamps: true })
export class GameplayTime extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: User;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true, type: Number, ref: Table.name })
  table: Table;

  @Prop({ required: true, type: Number, ref: Gameplay.name })
  gameplay: number;

  @Prop({ required: true })
  date: string;

  @Prop()
  startHour: string;

  @Prop()
  finishHour: string;
}

export const GameplayTimeSchema = SchemaFactory.createForClass(GameplayTime);

// Indexes for frequent queries
// For date range queries with user and startHour sorting
GameplayTimeSchema.index({ date: 1, user: 1, startHour: 1 });
// For user and date queries
GameplayTimeSchema.index({ user: 1, date: 1 });
// For location and date queries
GameplayTimeSchema.index({ location: 1, date: 1 });
// For gameplay and date queries
GameplayTimeSchema.index({ gameplay: 1, date: 1 });
// For date range queries
GameplayTimeSchema.index({ date: 1 });

purifySchema(GameplayTimeSchema);
