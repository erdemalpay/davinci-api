import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';

export class CheckDuty {
  @Prop({ required: true, type: String })
  duty: string;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];
}

@Schema({ _id: false })
export class Checklist extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  active: boolean;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];

  @Prop([CheckDuty])
  duties: CheckDuty[];
}

export const ChecklistSchema = SchemaFactory.createForClass(Checklist);

purifySchema(ChecklistSchema);
