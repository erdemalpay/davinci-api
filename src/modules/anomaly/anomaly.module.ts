import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Product, ProductSchema } from '../accounting/product.schema';
import {
  ProductStockHistory,
  ProductStockHistorySchema,
} from '../accounting/productStockHistory.schema';
import { Activity, ActivitySchema } from '../activity/activity.schema';
import { Break, BreakSchema } from '../break/break.schema';
import {
  ButtonCall,
  ButtonCallSchema,
} from '../buttonCall/schemas/buttonCall.schema';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import { Location, LocationSchema } from '../location/location.schema';
import { Middleman, MiddlemanSchema } from '../middleman/middleman.schema';
import { Collection, CollectionSchema } from '../order/collection.schema';
import { Order, OrderSchema } from '../order/order.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { Table, TableSchema } from '../table/table.schema';
import { User, UserSchema } from '../user/user.schema';
import { Visit, VisitSchema } from '../visit/visit.schema';
import { AnomalyController } from './anomaly.controller';
import { AnomalyCronService } from './anomaly.cron.service';
import { Anomaly, AnomalySchema } from './anomaly.schema';
import { AnomalyService } from './anomaly.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Anomaly.name, AnomalySchema),
      // Read-only: the day's records the checks look at.
      createAutoIncrementConfig(Table.name, TableSchema),
      createAutoIncrementConfig(Order.name, OrderSchema),
      createAutoIncrementConfig(Collection.name, CollectionSchema),
      createAutoIncrementConfig(Activity.name, ActivitySchema),
      createAutoIncrementConfig(Visit.name, VisitSchema),
      createAutoIncrementConfig(Shift.name, ShiftSchema),
      createAutoIncrementConfig(Location.name, LocationSchema),
      createAutoIncrementConfig(Break.name, BreakSchema),
      createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
      createAutoIncrementConfig(Gameplay.name, GameplaySchema),
      createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
      createAutoIncrementConfig(
        ProductStockHistory.name,
        ProductStockHistorySchema,
      ),
      { name: User.name, useFactory: () => UserSchema },
      { name: Product.name, useFactory: () => ProductSchema },
    ]),
  ],
  controllers: [AnomalyController],
  providers: [AnomalyService, AnomalyCronService],
})
export class AnomalyModule {}
