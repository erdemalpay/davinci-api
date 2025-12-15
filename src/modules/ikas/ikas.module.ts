import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { UserModule } from 'src/modules/user/user.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { VisitModule } from '../visit/visit.module';
import { AccountingModule } from './../accounting/accounting.module';
import { LocationModule } from './../location/location.module';
import { MenuModule } from './../menu/menu.module';
import { IkasController } from './ikas.controller';
import { IkasService } from './ikas.service';
import { IkasOrderProcessor } from './ikas-order.processor';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ikas-orders',
    }),
    WebSocketModule,
    RedisModule,
    HttpModule,
    UserModule,
    LocationModule,
    NotificationModule,
    VisitModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => AccountingModule),
  ],
  providers: [IkasService, IkasOrderProcessor],
  exports: [IkasService],
  controllers: [IkasController],
})
export class IkasModule {}
