import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
@Schema()
export class Table extends Document {
  @Prop({ unique: true, required: true, index: true})
  gameplays:

  @Prop({ unique: true, required: true, index: true })
  playerCount: Number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  active: boolean;

  @Prop({ required: true })
  startHour: boolean;

  @Prop({ required: true })
  finishHour: boolean;


}

export const TableSchema = SchemaFactory.createForClass(Table);

purifySchema(TableSchema);