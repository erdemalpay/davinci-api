import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { PanelControlModule } from '../panelControl/panelControl.module';
import { RedisModule } from '../redis/redis.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationGateway } from './authorization.gateway';
import { RolesGuard } from './authorization.guard';
import { Authorization, AuthorizationSchema } from './authorization.schema';
import { AuthorizationService } from './authorization.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Authorization.name, AuthorizationSchema),
]);
@Module({
  imports: [mongooseModule, RedisModule, PanelControlModule],
  providers: [AuthorizationService, AuthorizationGateway, RolesGuard],
  exports: [AuthorizationService, AuthorizationGateway, RolesGuard],
  controllers: [AuthorizationController],
})
export class AuthorizationModule {}
