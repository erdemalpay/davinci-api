import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
@Schema()
export class User extends Document {
  @Prop({ unique: true, required: true, index: true })
  username: string;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true })
  password: string;
  
  @Prop({ required: true })
  active: boolean;
  
  @Prop({ required: true, default: 'user' })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

purifySchema(UserSchema, ['password']);
