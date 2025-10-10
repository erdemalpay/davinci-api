import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Kitchen extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  isConfirmationRequired: boolean;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];

  @Prop({ required: false, type: [Number] })
  soundRoles: number[];

  @Prop({ required: false, type: [{ type: String, ref: User.name }] })
  selectedUsers: string[];
}

export const KitchenSchema = SchemaFactory.createForClass(Kitchen);

purifySchema(KitchenSchema);
