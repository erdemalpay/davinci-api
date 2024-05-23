import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Unit } from './unit.schema';

@Schema({ _id: false })
export class PackageType extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String, ref: Unit.name })
  unit: string;

  @Prop({ required: true, type: Number })
  quantity: number;
}

export const PackageTypeSchema = SchemaFactory.createForClass(PackageType);

purifySchema(PackageTypeSchema);
