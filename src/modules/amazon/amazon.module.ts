import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingModule } from '../accounting/accounting.module';
import { IntegrationRequestLogModule } from '../integration-request-log/integration-request-log.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../user/user.module';
import { WebhookLogModule } from '../webhook-log/webhook-log.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AmazonClient } from './amazon.client';
import { AmazonController } from './amazon.controller';
import { AmazonCronService } from './amazon.cron.service';
import { AmazonOrderService } from './amazon-order.service';
import { AmazonService } from './amazon.service';
import {
  ProcessedAmazonReturn,
  ProcessedAmazonReturnSchema,
} from './processed-amazon-return.schema';

@Module({
  imports: [
    WebSocketModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: ProcessedAmazonReturn.name, schema: ProcessedAmazonReturnSchema },
    ]),
    RedisModule,
    WebhookLogModule,
    IntegrationRequestLogModule,
    forwardRef(() => UserModule),
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountingModule),
  ],
  controllers: [AmazonController],
  providers: [
    AmazonClient,
    AmazonService,
    AmazonOrderService,
    AmazonCronService,
  ],
})
export class AmazonModule {}
