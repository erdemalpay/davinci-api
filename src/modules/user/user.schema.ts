import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { RolePermissionEnum } from './user.role.enum';
import { Role } from './user.role.schema';

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

  @Prop({
    required: true,
    type: Number,
    ref: Role.name,
    default: 2, // Game master
  })
  role: Role;
}

export const UserSchema = SchemaFactory.createForClass(User);

purifySchema(UserSchema, ['password']);
