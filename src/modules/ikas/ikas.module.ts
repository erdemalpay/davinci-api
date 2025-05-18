import { HttpModule } from '@nestjs/axios';
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
import { IkasGateway } from './ikas.gateway';
import { IkasService } from './ikas.service';

@Module({
  imports: [
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
  providers: [IkasService, IkasGateway],
  exports: [IkasService, IkasGateway],
  controllers: [IkasController],
})
export class IkasModule {}
