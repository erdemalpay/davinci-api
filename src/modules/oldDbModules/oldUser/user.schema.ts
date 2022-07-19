import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class User extends Document {
  @Prop({ type: String, required: true, index: true })
  name: string;

  @Prop({ type: String, required: true, index: true })
  username: string;

  @Prop({ type: String, required: true })
  password: string;

  @Prop({ required: true })
  active: boolean;
}

export const OldUserSchema = SchemaFactory.createForClass(User);
