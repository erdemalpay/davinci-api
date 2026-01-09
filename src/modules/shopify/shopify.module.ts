import { forwardRef, Module } from '@nestjs/common';
import { UserModule } from 'src/modules/user/user.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { VisitModule } from '../visit/visit.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AccountingModule } from './../accounting/accounting.module';
import { LocationModule } from './../location/location.module';
import { MenuModule } from './../menu/menu.module';
import { ShopifyController } from './shopify.controller';
import { ShopifyService } from './shopify.service';

@Module({
  imports: [
    WebSocketModule,
    RedisModule,
    UserModule,
    LocationModule,
    NotificationModule,
    VisitModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountingModule),
  ],
  providers: [ShopifyService],
  exports: [ShopifyService],
  controllers: [ShopifyController],
})
export class ShopifyModule {}

