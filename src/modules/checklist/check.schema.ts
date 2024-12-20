import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { Checklist } from './checklist.schema';

export class CheckDuty {
  @Prop({ required: true, type: String })
  duty: string;

  @Prop({ required: true, type: Boolean })
  isCompleted: boolean;
}

@Schema({ _id: false })
export class Check extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: String, ref: Checklist.name })
  checklist: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop([CheckDuty])
  duties: CheckDuty[];

  @Prop({ required: false, type: Date })
  completedAt: Date;

  @Prop({ required: true })
  isCompleted: boolean;
}

export const CheckSchema = SchemaFactory.createForClass(Check);

purifySchema(CheckSchema);

// TODO: Status enum will be added
