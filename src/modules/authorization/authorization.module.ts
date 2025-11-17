import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { PanelControlModule } from '../panelControl/panelControl.module';
import { RedisModule } from '../redis/redis.module';
import { AuthorizationController } from './authorization.controller';
import { RolesGuard } from './authorization.guard';
import { Authorization, AuthorizationSchema } from './authorization.schema';
import { AuthorizationService } from './authorization.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Authorization.name, AuthorizationSchema),
]);
@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    RedisModule,
    ActivityModule,
    forwardRef(() => PanelControlModule),
  ],
  providers: [AuthorizationService, RolesGuard],
  exports: [AuthorizationService, RolesGuard],
  controllers: [AuthorizationController],
})
export class AuthorizationModule {}
