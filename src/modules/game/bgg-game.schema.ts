import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

@Schema({ _id: false, collection: 'bgggames' })
export class BggGame extends Document {
  @Prop({ type: Number, required: true })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: Number })
  playersMin: number;

  @Prop({ type: Number })
  playersMax: number;

  @Prop({ type: Number })
  playingTime: number;

  @Prop({ type: Number })
  playTimeMin: number;

  @Prop({ type: Number })
  playTimeMax: number;

  @Prop({ type: Number })
  langDep: number;

  @Prop({ type: Number })
  yearPublished: number;

  @Prop({ type: Number })
  overallRank: number;

  @Prop({ type: Number })
  geekRating: number;

  @Prop({ type: Number })
  avgWeight: number;

  @Prop({ type: Number })
  avgRating: number;

  @Prop({ type: [Number], default: [] })
  best: number[];

  @Prop({ type: [Number], default: [] })
  recommended: number[];

  @Prop({ type: [Number], default: [] })
  categories: number[];

  @Prop({ type: [Number], default: [] })
  families: number[];

  @Prop({ type: [Number], default: [] })
  mechanics: number[];

  @Prop({ type: [Number], default: [] })
  subdomains: number[];

  @Prop({ type: String })
  pollPlayerAge: string;

  @Prop({ type: Number })
  pollMinAge: number;

  @Prop({ type: Number })
  minPlayerAge: number;

  @Prop({ type: Number })
  weightVotes: number;

  @Prop({ type: Number })
  ratingVotes: number;

  @Prop({ type: [Number], default: [] })
  languages: number[];

  @Prop({ type: Number })
  plyNumVotes?: number;
}

export const BggGameSchema = SchemaFactory.createForClass(BggGame);

purifySchema(BggGameSchema);
