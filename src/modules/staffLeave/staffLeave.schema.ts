import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';

// Yıllık izin, rapor, fazla mesai gibi türler (Tanımlamalar sayfasında yönetilir).
@Schema({ _id: false })
export class StaffLeaveType extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  backgroundColor?: string;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const StaffLeaveTypeSchema =
  SchemaFactory.createForClass(StaffLeaveType);

purifySchema(StaffLeaveTypeSchema);

// Kaydın tek bir gününe yazılan not.
export class StaffLeaveNote {
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;
}

// Tek gün için startDate ile endDate aynıdır.
@Schema({ _id: false, timestamps: true })
export class StaffLeave extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Number, ref: StaffLeaveType.name })
  type: number;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop([StaffLeaveNote])
  notes: StaffLeaveNote[];

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;
}

export const StaffLeaveSchema = SchemaFactory.createForClass(StaffLeave);

// For the month range query
StaffLeaveSchema.index({ startDate: 1, endDate: 1 });

purifySchema(StaffLeaveSchema);
