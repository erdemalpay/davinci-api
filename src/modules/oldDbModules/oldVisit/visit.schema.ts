import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../oldUser/user.schema';

@Schema()
export class Visit extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  user: User;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop({})
  finishHour: string;
}

export const OldVisitSchema = SchemaFactory.createForClass(Visit);
