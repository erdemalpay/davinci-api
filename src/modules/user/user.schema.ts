import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class User extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  name: string;

  @Prop({ type: String, required: true })
  password: string;

  @Prop({ required: true })
  active: boolean;

  @Prop({ type: String, required: true, default: 'user' })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

purifySchema(UserSchema, ['password']);
