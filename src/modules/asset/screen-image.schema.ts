import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

// Order and display duration of a tv-screen image; the image itself lives in Cloudinary.
@Schema({ _id: false, timestamps: true })
export class ScreenImage extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, unique: true })
  publicId: string;

  @Prop({ required: true })
  order: number;

  // Seconds
  @Prop({ required: true })
  duration: number;
}

export const ScreenImageSchema = SchemaFactory.createForClass(ScreenImage);

purifySchema(ScreenImageSchema);
