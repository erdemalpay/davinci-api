import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

export enum MiddlemanPlanSource {
  // Picked by the system: whoever was the middleman on the fewest days this
  // month.
  AUTO = 'auto',
  // Someone took the role themselves ("Ortacıyım").
  MANUAL = 'manual',
  // A stand-in kept the role after the middleman left the cafe.
  TAKEOVER = 'takeover',
}

// Who is the day's middleman at a location. The system starts the role for
// them from 14:00 while at least two game masters are in the cafe; someone
// else only stands in.
@Schema({ _id: false, timestamps: true })
export class MiddlemanPlan extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, enum: MiddlemanPlanSource })
  source: MiddlemanPlanSource;
}

export const MiddlemanPlanSchema = SchemaFactory.createForClass(MiddlemanPlan);

MiddlemanPlanSchema.index({ location: 1, date: 1 }, { unique: true });

purifySchema(MiddlemanPlanSchema);

// Sets the day's middleman at a location. Not an upsert: ids come from the
// auto-increment plugin, which only runs on create.
export async function setMiddlemanPlan(
  model: Model<MiddlemanPlan>,
  plan: Pick<MiddlemanPlan, 'location' | 'date' | 'user' | 'source'>,
) {
  const { location, date, user, source } = plan;
  const updated = await model.updateOne(
    { location, date },
    { $set: { user, source } },
  );
  if (updated.matchedCount > 0) return;
  try {
    await model.create(plan);
  } catch {
    // Created meanwhile (unique location and date): set it on that one.
    await model.updateOne({ location, date }, { $set: { user, source } });
  }
}
