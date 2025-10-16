import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Role } from '../user/user.role.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Notification extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: false, type: String })
  message: string;

  @Prop({ required: false, type: String })
  messageEn: string;

  @Prop({ required: false, type: String })
  messageTr: string;

  @Prop({ required: false, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: [{ type: String, ref: User.name }] })
  selectedUsers: string[];

  @Prop({ required: false, type: [{ type: Number, ref: Role.name }] })
  selectedRoles: number[];

  @Prop({ required: false, type: [{ type: Number, ref: Location.name }] })
  selectedLocations: number[];

  @Prop({ required: true, type: String }) // it may be cancelled or we may now the create type
  type: string;

  @Prop({ required: false, type: [{ type: String, ref: User.name }] })
  seenBy: string[];

  @Prop({ required: false, type: String })
  event: string;

  @Prop({ required: false, type: Boolean })
  isAssigned: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

purifySchema(NotificationSchema);
