import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { User } from '../user/user.schema';

class Style {
  @Prop({ required: false, type: String })
  color: string;

  @Prop({ required: false, type: String })
  backgroundColor: string;

  @Prop({ required: false, type: String })
  fontSize: string;

  @Prop({ required: false, type: String })
  fontWeight: string;

  @Prop({ required: false, type: String })
  textAlign: string;

  @Prop({ required: false, type: String })
  imageHeight: string;

  @Prop({ required: false, type: String })
  imageWidth: string;

  @Prop({ required: false, type: String })
  imageBorderRadius: string;

  @Prop({ required: false, type: String })
  imageMargin: string;
}
class Subheader {
  @Prop({ required: false, type: String })
  componentType: string;

  @Prop({ required: false, type: String })
  subHeader: string;

  @Prop({ required: false, type: String })
  paragraph: string;

  @Prop({ required: false, type: String })
  imageUrl: string;

  @Prop({ required: false, type: Style })
  style: Style;

  @Prop({ required: true, type: Number })
  order: number;
}
class UpdateHistory {
  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Date })
  updatedAt: Date;

  @Prop({ required: false, type: [String] })
  updates: string[];
}
@Schema({ _id: false, timestamps: true })
export class Education extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: [Number] })
  permissionRoles: number[];

  @Prop({ required: true, type: String })
  header: string;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop([Subheader])
  subheaders: Subheader[];

  @Prop([UpdateHistory])
  updateHistory: UpdateHistory[];
}

export const EducationSchema = SchemaFactory.createForClass(Education);
