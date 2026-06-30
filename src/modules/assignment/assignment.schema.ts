import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import {
  AssignmentPriorityEnum,
  AssignmentStatusEnum,
  AssignmentTypeEnum,
} from './assignment.dto';

export class AssignmentSubject {
  @Prop({ type: String, required: false })
  entityType?: string;

  @Prop({ type: SchemaTypes.Mixed, required: false })
  entityId?: string | number;
}

@Schema({ _id: false })
export class Assignment extends Document {
  @Prop({ type: Number })
  _id: number;
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: String, required: true, enum: AssignmentTypeEnum })
  assignmentType: AssignmentTypeEnum;

  @Prop({ required: true, type: String, ref: User.name })
  assignedBy: string;

  @Prop({ required: true, type: String, ref: User.name })
  assignedTo: string;

  @Prop({ type: AssignmentSubject, required: false })
  subject?: AssignmentSubject;

  @Prop({ type: Date, required: false })
  dueDate?: Date;

  @Prop({
    type: String,
    enum: AssignmentStatusEnum,
    default: AssignmentStatusEnum.DRAFT,
    required: true,
  })
  status: AssignmentStatusEnum;

  @Prop({
    type: String,
    enum: AssignmentPriorityEnum,
    default: AssignmentPriorityEnum.MEDIUM,
    required: true,
  })
  priority: AssignmentPriorityEnum;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  payload: Record<string, unknown>;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);

purifySchema(AssignmentSchema);
