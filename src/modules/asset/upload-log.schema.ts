import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

// _id: false disables Mongoose's default ObjectId generation;
// createAutoIncrementConfig handles _id as an auto-incremented number instead.
@Schema({ _id: false, timestamps: true })
export class UploadLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true, enum: ['success', 'error'] })
  status: 'success' | 'error';

  @Prop({ default: '' })
  message: string;

  @Prop()
  uploadedBy: string;

  @Prop()
  folder: string;
}

export const UploadLogSchema = SchemaFactory.createForClass(UploadLog);

purifySchema(UploadLogSchema);
