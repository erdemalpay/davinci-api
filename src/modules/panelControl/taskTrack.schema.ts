import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../oldDbModules/oldUser/user.schema';

@Schema({ _id: false })
export class TaskTrack extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  task: string;

  @Prop({ required: true, type: [{ type: String, ref: User.name }] })
  users: string[];

  @Prop({ required: true, type: [{ type: String }] })
  type: string[];

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export const TaskTrackSchema = SchemaFactory.createForClass(TaskTrack);

purifySchema(TaskTrackSchema);
