import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

@Schema({ _id: false, collection: 'bgggames' })
export class BggGame extends Document {
  @Prop({ type: Number, required: true })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: Number, required: true })
  GameId: number;

  @Prop({ required: true })
  Name: string;

  @Prop({ type: Number })
  PlayersMin: number;

  @Prop({ type: Number })
  PlayersMax: number;

  @Prop({ type: Number })
  PlayingTime: number;

  @Prop({ type: Number })
  PlayTimeMin: number;

  @Prop({ type: Number })
  PlayTimeMax: number;

  @Prop({ type: Number })
  LangDep: number;

  @Prop({ type: Number })
  YearPublished: number;

  @Prop({ type: Number })
  OverallRank: number;

  @Prop({ type: Number })
  GeekRating: number;

  @Prop({ type: Number })
  AvgWeight: number;

  @Prop({ type: Number })
  AvgRating: number;

  @Prop({ type: [Number], default: [] })
  Best: number[];

  @Prop({ type: [Number], default: [] })
  Recommended: number[];

  @Prop({ type: [Number], default: [] })
  Categories: number[];

  @Prop({ type: [Number], default: [] })
  Families: number[];

  @Prop({ type: [Number], default: [] })
  Mechanics: number[];

  @Prop({ type: [Number], default: [] })
  Subdomains: number[];

  @Prop({ type: String })
  PollPlayerAge: string;

  @Prop({ type: Number })
  PollMinAge: number;

  @Prop({ type: Number })
  MinPlayerAge: number;

  @Prop({ type: Number })
  WeightVotes: number;

  @Prop({ type: Number })
  RatingVotes: number;

  @Prop({ type: [Number], default: [] })
  Languages: number[];

  @Prop({ type: Number })
  PlyNumVotes?: number;
}

export const BggGameSchema = SchemaFactory.createForClass(BggGame);

purifySchema(BggGameSchema);
