import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { TableModule } from 'src/modules/table/table.module';
import { DatabaseModule } from '../database/database.module';
import { TableSchema } from '../table/table.schema';
import { Collection, CollectionSchema } from './collection.schema';
import { OrderController } from './order.controller';
import { Order, OrderSchema } from './order.schema';
import { OrderService } from './order.service';
import { OrderPayment, OrderPaymentSchema } from './orderPayment';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(OrderPayment.name, OrderPaymentSchema),
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
  providers: [OrderService],
})
export class OrderModule {}
