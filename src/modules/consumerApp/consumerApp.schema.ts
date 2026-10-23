import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Consumer } from '../consumer/consumer.schema';
import { Game } from '../game/game.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
import { Table } from '../table/table.schema';

// A consumer sat at a table: scanned its QR code in the customer app.
@Schema({ _id: false, timestamps: true })
export class TableCheckIn extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Consumer.name, index: true })
  consumer: number;

  @Prop({ required: true, type: Number, ref: Table.name, index: true })
  table: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  // The name on the QR code (a merged table has several).
  @Prop({ required: true })
  tableName: string;

  @Prop({ required: true })
  date: string;
}

export const TableCheckInSchema = SchemaFactory.createForClass(TableCheckIn);

TableCheckInSchema.index({ consumer: 1, table: 1 }, { unique: true });

purifySchema(TableCheckInSchema);

@Schema({ _id: false })
export class GameplayResultPlayer {
  // Empty for a guest without the app.
  @Prop({ required: false, type: Number, ref: Consumer.name })
  consumer?: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false, type: Number })
  score?: number;

  @Prop({ required: true, type: Boolean, default: false })
  isWinner: boolean;
}

const GameplayResultPlayerSchema =
  SchemaFactory.createForClass(GameplayResultPlayer);

// Who played a game at a table and who won, entered by the players.
@Schema({ _id: false, timestamps: true })
export class GameplayResult extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({
    required: true,
    type: Number,
    ref: Gameplay.name,
    unique: true,
  })
  gameplay: number;

  @Prop({ required: true, type: Number, ref: Game.name })
  game: number;

  @Prop({ required: true, type: Number, ref: Table.name })
  table: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, type: [GameplayResultPlayerSchema] })
  players: GameplayResultPlayer[];

  @Prop({ required: true, type: Number, ref: Consumer.name })
  createdBy: number;
}

export const GameplayResultSchema =
  SchemaFactory.createForClass(GameplayResult);

GameplayResultSchema.index({ 'players.consumer': 1, date: -1 });

purifySchema(GameplayResultSchema);
