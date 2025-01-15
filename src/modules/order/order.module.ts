import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { TableModule } from 'src/modules/table/table.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../user/user.module';
import { AccountingModule } from './../accounting/accounting.module';
import { ActivityModule } from './../activity/activity.module';
import { MenuModule } from './../menu/menu.module';
import { Collection, CollectionSchema } from './collection.schema';
import { Discount, DiscountSchema } from './discount.schema';
import { OrderController } from './order.controller';
import { OrderGateway } from './order.gateway';
import { Order, OrderSchema } from './order.schema';
import { OrderService } from './order.service';
import { OrderGroup, OrderGroupSchema } from './orderGroup.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(OrderGroup.name, OrderGroupSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(Discount.name, DiscountSchema),
]);

@Module({
  imports: [
    mongooseModule,
    ActivityModule,
    GameplayModule,
    RedisModule,
    forwardRef(() => AccountingModule),
    forwardRef(() => TableModule),
    forwardRef(() => MenuModule),
    forwardRef(() => UserModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderGateway],
  exports: [OrderService],
})
export class OrderModule {}
