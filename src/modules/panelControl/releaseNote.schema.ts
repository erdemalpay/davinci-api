import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class ReleaseNoteItem {
  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, default: '' })
  description: string;
}

export const ReleaseNoteItemSchema =
  SchemaFactory.createForClass(ReleaseNoteItem);

@Schema({ _id: false })
export class ReleaseNote extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, unique: true, type: String })
  releaseId: string;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({
    type: [ReleaseNoteItemSchema],
    default: [],
  })
  items: ReleaseNoteItem[];

  @Prop({ type: Boolean, default: false })
  isPublished: boolean;
}

export const ReleaseNoteSchema = SchemaFactory.createForClass(ReleaseNote);

purifySchema(ReleaseNoteSchema);
