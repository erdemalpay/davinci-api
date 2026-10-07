import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Game, GameSchema } from '../game/game.schema';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  InventoryBox,
  InventoryBoxSchema,
  InventoryGameCode,
  InventoryGameCodeSchema,
  InventoryLocation,
  InventoryLocationSchema,
  InventoryMovement,
  InventoryMovementSchema,
} from './inventory.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(InventoryLocation.name, InventoryLocationSchema),
  createAutoIncrementConfig(InventoryMovement.name, InventoryMovementSchema),
  { name: InventoryGameCode.name, useFactory: () => InventoryGameCodeSchema },
  { name: InventoryBox.name, useFactory: () => InventoryBoxSchema },
  { name: Game.name, useFactory: () => GameSchema },
]);

@Module({
  imports: [WebSocketModule, mongooseModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
