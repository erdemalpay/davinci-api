import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { UserModule } from 'src/modules/user/user.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AccountingModule } from './../accounting/accounting.module';
import { LocationModule } from './../location/location.module';
import { MenuModule } from './../menu/menu.module';
import { TrendyolController } from './trendyol.controller';
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
  ],
  controllers: [TrendyolController],
  providers: [TrendyolService],
  exports: [TrendyolService],
})
export class TrendyolModule {}
