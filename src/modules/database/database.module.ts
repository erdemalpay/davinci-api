import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderSchema } from '../order/order.schema';
import { TableSchema } from '../table/table.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Table', schema: TableSchema }]),
    MongooseModule.forFeature([{ name: 'Order', schema: OrderSchema }]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
