import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from 'src/modules/user/user.module';
import { AccountingModule } from '../accounting/accounting.module';
import { IntegrationRequestLogModule } from '../integration-request-log/integration-request-log.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { WebhookLogModule } from '../webhook-log/webhook-log.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { N11Client } from './n11.client';
import { N11Controller } from './n11.controller';
import { N11CronService } from './n11.cron.service';
import { N11OrderService } from './n11-order.service';
import { N11Service } from './n11.service';
import {
  ProcessedN11Claim,
  ProcessedN11ClaimSchema,
} from './processed-n11-claim.schema';

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
    MongooseModule.forFeature([
      { name: ProcessedN11Claim.name, schema: ProcessedN11ClaimSchema },
    ]),
  ],
  controllers: [N11Controller],
  providers: [N11Client, N11Service, N11OrderService, N11CronService],
  exports: [N11Service, N11OrderService],
})
export class N11Module {}
