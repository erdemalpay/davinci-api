import { Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class Education extends Document {
  // ...empty schema...
}

export const EducationSchema = SchemaFactory.createForClass(Education);
