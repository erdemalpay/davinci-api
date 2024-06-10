import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export class PageTab {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: [Number] })
  permissionsRoles: number[];
}

@Schema({ _id: false })
export class Page extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop([PageTab])
  tabs: PageTab[];

  @Prop({ required: true, type: [Number] })
  permissionRoles: number[];
}

export const PageSchema = SchemaFactory.createForClass(Page);

purifySchema(PageSchema);
