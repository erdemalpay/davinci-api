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
import { PanelControlGateway } from './panelControl.gateway';
import { PanelControlService } from './panelControl.service';
import { PanelSettings, PanelSettingsSchema } from './panelSettings.schema';
import { TaskTrack, TaskTrackSchema } from './taskTrack.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Page.name, useFactory: () => PageSchema },
  { name: DisabledCondition.name, useFactory: () => DisabledConditionSchema },
  { name: Action.name, useFactory: () => ActionSchema },
  createAutoIncrementConfig(PanelSettings.name, PanelSettingsSchema),
  createAutoIncrementConfig(TaskTrack.name, TaskTrackSchema),
]);

@Module({
  imports: [
    mongooseModule,
    RedisModule,
    HttpModule,
    forwardRef(() => AuthorizationModule),
  ],
  providers: [PanelControlService, PanelControlGateway],
  controllers: [PanelControlController],
  exports: [
    mongooseModule,
    PanelControlService,
    PanelControlModule,
    PanelControlGateway,
  ],
})
export class PanelControlModule {}
