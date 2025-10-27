import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Role } from '../user/user.role.schema';
import { User } from '../user/user.schema';

export class NotificationMessage {
  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  params!: Record<string, unknown>;
}

@Schema({ _id: false })
export class Notification extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Date, default: () => new Date() })
  createdAt: Date;

  @Prop({ type: NotificationMessage, required: true })
  message: NotificationMessage;

  @Prop({ required: false, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: [{ type: String, ref: User.name }] })
  selectedUsers: string[];

  @Prop({ required: false, type: [{ type: Number, ref: Role.name }] })
  selectedRoles: number[];

  @Prop({ required: false, type: [{ type: Number, ref: Location.name }] })
  selectedLocations: number[];

  @Prop({ required: true, type: String })
  type: string;

  @Prop({ required: false, type: [{ type: String, ref: User.name }] })
  seenBy: string[];

  @Prop({ required: false, type: String })
  event: string;

  @Prop({ required: false, type: Boolean, default: false })
  isAssigned: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ createdAt: -1 });

purifySchema(NotificationSchema);
