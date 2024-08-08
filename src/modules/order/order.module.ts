import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { TableModule } from 'src/modules/table/table.module';
import { DatabaseModule } from '../database/database.module';
import { TableSchema } from '../table/table.schema';
import { Collection, CollectionSchema } from './collection.schema';
import { Discount, DiscountSchema } from './discount.schema';
import { OrderController } from './order.controller';
import { OrderGateway } from './order.gateway';
import { Order, OrderSchema } from './order.schema';
import { OrderService } from './order.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(Discount.name, DiscountSchema),
]);

@Module({
  imports: [
    mongooseModule,
    DatabaseModule,
    TableModule,
    MongooseModule.forFeature([
      { name: 'Order', schema: OrderSchema },
      { name: 'Table', schema: TableSchema },
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderGateway],
})
export class OrderModule {}
