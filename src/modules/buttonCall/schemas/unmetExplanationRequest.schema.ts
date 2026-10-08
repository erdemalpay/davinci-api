import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Game } from 'src/modules/game/game.schema';
import { Location } from 'src/modules/location/location.schema';
import { ButtonCall } from './buttonCall.schema';

// A table asked for a game to be explained and nobody who knows the game
// was free at that moment. Lets managers see which games lack explainers.
@Schema({ _id: false, timestamps: true })
export class UnmetExplanationRequest extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String })
  hour: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: String })
  tableName: string;

  @Prop({ required: true, type: Number, ref: Game.name })
  game: number;

  // GameAvailabilityStatus at request time: busy, later or unavailable.
  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: false, type: String })
  availableFrom: string;

  // Set when the table chose to wait in line instead of picking another
  // game.
  @Prop({ required: false, type: Number, ref: ButtonCall.name })
  buttonCall: number;
}

export const UnmetExplanationRequestSchema = SchemaFactory.createForClass(
  UnmetExplanationRequest,
);

UnmetExplanationRequestSchema.index({ date: -1, location: 1 });
UnmetExplanationRequestSchema.index({
  date: 1,
  location: 1,
  tableName: 1,
  game: 1,
});

purifySchema(UnmetExplanationRequestSchema);
