import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameModule } from 'src/modules/game/game.module';
import { ActivityModule } from '../activity/activity.module';
import { AssetModule } from '../asset/asset.module';
import { IkasModule } from '../ikas/ikas.module';
import { Location, LocationSchema } from '../location/location.schema';
import { MenuModule } from '../menu/menu.module';
import { CheckoutModule } from './../checkout/checkout.module';
import { LocationModule } from './../location/location.module';
import { RedisModule } from './../redis/redis.module';
import { AccountingController } from './accounting.controller';
import { AccountingGateway } from './accounting.gateway';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { Count, CountSchema } from './count.schema';
import { CountList, CountListSchema } from './countList.schema';
import { Expense, ExpenseSchema } from './expense.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Payment, PaymentSchema } from './payment.schema';
import { PaymentMethod, PaymentMethodSchema } from './paymentMethod.schema';
import { Product, ProductSchema } from './product.schema';
import {
  ProductCategory,
  ProductCategorySchema,
} from './productCategory.schema';
import {
  ProductStockHistory,
  ProductStockHistorySchema,
} from './productStockHistory.schema';
import { Service, ServiceSchema } from './service.schema';
import { Stock, StockSchema } from './stock.schema';
import { Vendor, VendorSchema } from './vendor.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Product.name, useFactory: () => ProductSchema },
  { name: Service.name, useFactory: () => ServiceSchema },
  { name: ExpenseType.name, useFactory: () => ExpenseTypeSchema },
  { name: Brand.name, useFactory: () => BrandSchema },
  { name: Vendor.name, useFactory: () => VendorSchema },
  { name: Stock.name, useFactory: () => StockSchema },
  { name: CountList.name, useFactory: () => CountListSchema },
  { name: Count.name, useFactory: () => CountSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  { name: PaymentMethod.name, useFactory: () => PaymentMethodSchema },
  { name: ProductCategory.name, useFactory: () => ProductCategorySchema },
  createAutoIncrementConfig(Expense.name, ExpenseSchema),
  createAutoIncrementConfig(
    ProductStockHistory.name,
    ProductStockHistorySchema,
  ),
  createAutoIncrementConfig(Payment.name, PaymentSchema),
]);

@Module({
  imports: [
    mongooseModule,
    ActivityModule,
    GameModule,
    CheckoutModule,
    RedisModule,
    AssetModule,
    forwardRef(() => LocationModule),
    forwardRef(() => IkasModule),
    forwardRef(() => MenuModule),
  ],
  providers: [AccountingService, AccountingGateway],
  exports: [AccountingService, AccountingGateway],
  controllers: [AccountingController],
})
export class AccountingModule {}
