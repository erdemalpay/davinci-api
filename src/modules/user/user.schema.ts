import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Game } from '../game/game.schema';
import { WorkType } from './user.enums';
import { Role } from './user.role.schema';

class UserGame {
  @Prop({ required: true, type: Number, ref: Game.name })
  game: number;

  @Prop()
  learnDate: string;
}

@Schema({ _id: false })
export class User extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  name: string;

  @Prop({ type: String })
  cafeId: string;

  @Prop({ type: String })
  fullName: string;

  @Prop({ type: String, required: true })
  password: string;

  @Prop({ type: String })
  imageUrl: string;

  @Prop({ type: Date })
  jobStartDate: Date;

  @Prop({ type: Date })
  jobEndDate?: Date;

  @Prop({ type: Date })
  insuranceStartDate: Date;

  @Prop({ type: String })
  profileImage: string;

  @Prop({ type: String })
  phone: string;

  @Prop({ type: String })
  address: string;

  @Prop({ type: Number })
  rowsPerPage: number;

  @Prop({ type: String })
  language: string;

  @Prop({ type: String })
  iban: string;

  @Prop({ type: String })
  birthDate: Date;

  @Prop({ type: String, enum: WorkType })
  workType: WorkType;

  @Prop({ required: true })
  active: boolean;

  @Prop([UserGame])
  userGames: UserGame[];

  @Prop({
    required: true,
    type: Number,
    ref: Role.name,
    default: Number(2), // Game master
  })
  role: Role;
}

export const UserSchema = SchemaFactory.createForClass(User);

purifySchema(UserSchema, ['password']);
