import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { RolePermissionEnum } from './user.role.enum';

@Schema({ _id: false })
export class Role extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  color: string;

  @Prop({
    required: true,
    type: [{ type: String, enum: RolePermissionEnum }],
    default: [RolePermissionEnum.CHECKIN],
  })
  permissions: RolePermissionEnum[];
}

export const RoleSchema = SchemaFactory.createForClass(Role);

purifySchema(RoleSchema);
