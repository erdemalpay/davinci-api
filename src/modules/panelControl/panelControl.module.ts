import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Action } from 'rxjs/internal/scheduler/Action';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RedisModule } from './../redis/redis.module';
import { ActionSchema } from './action.schema';
import {
  DisabledCondition,
  DisabledConditionSchema,
} from './disabledCondition.schema';
import { Page, PageSchema } from './page.schema';
import { PanelControlController } from './panelControl.controller';
import { PanelControlService } from './panelControl.service';
import { PanelSettings, PanelSettingsSchema } from './panelSettings.schema';
import { TaskTrack, TaskTrackSchema } from './taskTrack.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Page.name, useFactory: () => PageSchema },
  { name: DisabledCondition.name, useFactory: () => DisabledConditionSchema },
  { name: Action.name, useFactory: () => ActionSchema },
  createAutoIncrementConfig(PanelSettings.name, PanelSettingsSchema),
  createAutoIncrementConfig(TaskTrack.name, TaskTrackSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    RedisModule,
    HttpModule,
    forwardRef(() => AuthorizationModule),
  ],
  providers: [PanelControlService],
  controllers: [PanelControlController],
  exports: [
    mongooseModule,
    PanelControlService,
    PanelControlModule,
  ],
})
export class PanelControlModule {}
