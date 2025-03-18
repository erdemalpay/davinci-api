import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RedisModule } from './../redis/redis.module';
import { CheckoutCash, CheckoutCashSchema } from './checkoutCash.schema';
import { Page, PageSchema } from './page.schema';
import { PanelControlController } from './panelControl.controller';
import { PanelControlGateway } from './panelControl.gateway';
import { PanelControlService } from './panelControl.service';
import { PanelSettings, PanelSettingsSchema } from './panelSettings.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Page.name, useFactory: () => PageSchema },
  createAutoIncrementConfig(CheckoutCash.name, CheckoutCashSchema),
  createAutoIncrementConfig(PanelSettings.name, PanelSettingsSchema),
]);

@Module({
  imports: [mongooseModule, RedisModule, forwardRef(() => AuthorizationModule)],
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
