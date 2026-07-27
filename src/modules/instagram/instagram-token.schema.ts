import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ timestamps: true })
export class InstagramToken extends Document {
  @Prop({ required: true, type: String, unique: true, default: 'default' })
  key!: string;

  @Prop({ required: true, type: String })
  accessToken!: string;

  @Prop({ required: false, type: Date })
  expiresAt?: Date;

  @Prop({ required: false, type: Date })
  lastRefreshedAt?: Date;
}

export const InstagramTokenSchema =
  SchemaFactory.createForClass(InstagramToken);

purifySchema(InstagramTokenSchema, ['accessToken']);
