import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';
import { Role } from '../user/user.role.schema';

@Schema({ _id: false })
export class Authorization extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  path: string;

  @Prop({ required: true, type: String })
  method: string;

  @Prop({ required: true, type: [{ type: Number, ref: Role.name }] })
  roles: number[];

  @Prop({ required: false, type: [{ type: String }] })
  relatedPages: string[];
}

export const AuthorizationSchema = SchemaFactory.createForClass(Authorization);

purifySchema(AuthorizationSchema);
