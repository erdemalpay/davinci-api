import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

export type ButtonCallDocument = HydratedDocument<ButtonCall>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class ButtonCall {

  @Prop({
    required: true,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
  })
  tableName: string;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.Number,
    autopopulate: true,
  })
  location: number;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
  })
  date: string;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
  })
  startHour: string;

  @Prop({
    required: false,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
    default: '',
  })
  finishHour: string;

  @Prop({
    required: false,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
    default: '',
  })
  duration: string;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
  })
  createdBy: string;

  @Prop({
    required: false,
    type: mongoose.Schema.Types.String,
    autopopulate: true,
    default: '',
  })
  cancelledBy: string;
}

export const ButtonCallSchema = SchemaFactory.createForClass(ButtonCall);
