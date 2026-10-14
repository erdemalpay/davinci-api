import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { IntegrationRequestLogModule } from '../integration-request-log/integration-request-log.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../user/user.module';
import { WebhookLogModule } from '../webhook-log/webhook-log.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { IdefixClient } from './idefix.client';
import { IdefixController } from './idefix.controller';
import { IdefixCronService } from './idefix.cron.service';
import { IdefixOrderService } from './idefix-order.service';
import { IdefixService } from './idefix.service';

@Module({
  imports: [
    WebSocketModule,
    HttpModule,
    RedisModule,
    WebhookLogModule,
    IntegrationRequestLogModule,
    forwardRef(() => UserModule),
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountingModule),
  ],
  controllers: [IdefixController],
  providers: [
    IdefixClient,
    IdefixService,
    IdefixOrderService,
    IdefixCronService,
  ],
  exports: [IdefixService, IdefixOrderService],
})
export class IdefixModule {}
