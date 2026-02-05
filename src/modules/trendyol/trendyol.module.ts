import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from 'src/modules/user/user.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AccountingModule } from './../accounting/accounting.module';
import { LocationModule } from './../location/location.module';
import { MenuModule } from './../menu/menu.module';
import {
  ProcessedClaimItem,
  ProcessedClaimItemSchema,
} from './processed-claim-item.schema';
import { TrendyolController } from './trendyol.controller';
import { TrendyolCronService } from './trendyol.cron.service';
import { TrendyolService } from './trendyol.service';

@Module({
  imports: [
    WebSocketModule,
    HttpModule,
    UserModule,
    LocationModule,
    NotificationModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountingModule),
    MongooseModule.forFeature([
      {
        name: ProcessedClaimItem.name,
        schema: ProcessedClaimItemSchema,
      },
    ]),
  ],
  controllers: [TrendyolController],
  providers: [TrendyolService, TrendyolCronService],
  exports: [TrendyolService],
})
export class TrendyolModule {}
