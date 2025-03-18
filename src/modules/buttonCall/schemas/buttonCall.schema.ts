import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from 'src/modules/location/location.schema';
import { User } from 'src/modules/user/user.schema';

@Schema({ _id: false, timestamps: true })
export class ButtonCall extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  tableName: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String })
  startHour: string;

  @Prop({ required: false, type: String })
  finishHour: string;

  @Prop({ required: true, type: Number, default: 1})
  callCount: number;

  @Prop({ required: false, type: String })
  duration: string;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: String, ref: User.name })
  cancelledBy: string;
}

export const ButtonCallSchema = SchemaFactory.createForClass(ButtonCall);
purifySchema(ButtonCallSchema);
