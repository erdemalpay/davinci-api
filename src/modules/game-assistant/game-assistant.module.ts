import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameModule } from '../game/game.module';
import { PanelControlModule } from '../panelControl/panelControl.module';
import { RedisModule } from '../redis/redis.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { AssistantGuardService } from './assistant-guard.service';
import { AnthropicAssistantLlm, ASSISTANT_LLM } from './assistant-llm.client';
import {
  GameAssistantLog,
  GameAssistantLogSchema,
} from './game-assistant-log.schema';
import { GameAssistantController } from './game-assistant.controller';
import { GameAssistantService } from './game-assistant.service';
import { GameCatalogService } from './game-catalog.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(GameAssistantLog.name, GameAssistantLogSchema),
]);

@Module({
  imports: [
    mongooseModule,
    RedisModule,
    GameModule,
    PanelControlModule,
    forwardRef(() => ShopifyModule),
  ],
  controllers: [GameAssistantController],
  providers: [
    GameAssistantService,
    GameCatalogService,
    AssistantGuardService,
    { provide: ASSISTANT_LLM, useClass: AnthropicAssistantLlm },
  ],
  exports: [GameAssistantService],
})
export class GameAssistantModule {}
