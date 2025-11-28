import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Table extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ type: [{ type: Number, ref: Gameplay.name }] })
  gameplays: Gameplay[];

  @Prop({ required: true })
  playerCount: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false, type: [{ type: Number, ref: 'Order' }] })
  orders: number[];

  @Prop({ required: false, type: [{ type: String }] })
  tables: string[];

  @Prop({ required: false, type: Boolean, default: false })
  isOnlineSale: boolean;

  @Prop({ required: true, type: Boolean, default: false })
  isAutoEntryAdded: boolean;

  @Prop({ required: false, type: String, default: false })
  type: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour: string;

  @Prop()
  status: string;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;
}

export const TableSchema = SchemaFactory.createForClass(Table);
// Indexes for frequent queries
// For getByLocation() and findByDateAndLocation() - location, date, status queries (existing, kept)
TableSchema.index({ location: 1, date: -1, status: 1 });
// For create() - finding existing active tables (location + date + finishHour + status)
// This is critical as it's called on every table creation
TableSchema.index({ location: 1, date: 1, finishHour: 1, status: 1 });
// For getYerVarmiByLocation() and notifyUnclosedTables() - active tables query
// getYerVarmiByLocation is a public endpoint, notifyUnclosedTables runs daily
TableSchema.index({ location: 1, date: 1, finishHour: 1 });

purifySchema(TableSchema);
