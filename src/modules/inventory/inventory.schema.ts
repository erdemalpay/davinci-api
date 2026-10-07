import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class InventoryLocation extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  backgroundColor?: string;

  @Prop({ required: false })
  note?: string;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const InventoryLocationSchema =
  SchemaFactory.createForClass(InventoryLocation);

purifySchema(InventoryLocationSchema);

// Oyunun kutu kısaltması ve numara sayacı (oyun belgesine yazılmaz).
@Schema({ _id: false })
export class InventoryGameCode extends Document {
  @Prop({ type: Number })
  _id: number; // Game._id

  @Prop({ required: true, type: String, unique: true })
  shortCode: string;

  @Prop({ required: true, type: Number, default: 0 })
  seq: number;
}

export const InventoryGameCodeSchema =
  SchemaFactory.createForClass(InventoryGameCode);

purifySchema(InventoryGameCodeSchema);

export enum InventoryBoxSource {
  CONSUMPTION = 'CONSUMPTION',
  MANUAL = 'MANUAL',
}

@Schema({ _id: false, timestamps: true })
export class InventoryBox extends Document {
  @Prop({ type: String })
  _id: string; // "CAT-3"

  @Prop({ required: true, type: Number, ref: 'Game' })
  game: number;

  @Prop({ required: true, type: Number, ref: InventoryLocation.name })
  location: number;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(InventoryBoxSource),
  })
  source: InventoryBoxSource;

  @Prop({ required: false, type: Number, index: true })
  stockHistory?: number;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const InventoryBoxSchema = SchemaFactory.createForClass(InventoryBox);

purifySchema(InventoryBoxSchema);

export enum InventoryMovementType {
  CREATE = 'CREATE',
  MOVE = 'MOVE',
  DEACTIVATE = 'DEACTIVATE',
  CANCEL = 'CANCEL',
}

@Schema({ _id: false, timestamps: { createdAt: true, updatedAt: false } })
export class InventoryMovement extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, index: true })
  box: string;

  @Prop({ required: false, type: Number, index: true })
  game?: number;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(InventoryMovementType),
  })
  type: InventoryMovementType;

  @Prop({ required: false, type: Number })
  fromLocation?: number;

  @Prop({ required: false, type: Number })
  toLocation?: number;

  @Prop({ required: false })
  note?: string;

  @Prop({ required: true, type: String })
  user: string;
}

export const InventoryMovementSchema =
  SchemaFactory.createForClass(InventoryMovement);

purifySchema(InventoryMovementSchema);
