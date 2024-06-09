import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameModule } from 'src/modules/game/game.module';
import { ActivityModule } from '../activity/activity.module';
import { Location, LocationSchema } from '../location/location.schema';
import { MenuModule } from '../menu/menu.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { Count, CountSchema } from './count.schema';
import { CountList, CountListSchema } from './countList.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Fixture, FixtureSchema } from './fixture.schema';
import { FixtureCount, FixtureCountSchema } from './fixtureCount.schema';
import {
  FixtureCountList,
  FixtureCountListSchema,
} from './fixtureCountList.schema';
import { FixtureInvoice, FixtureInvoiceSchema } from './fixtureInvoice.schema';
import { FixtureStock, FixtureStockSchema } from './fixtureStock.schema';
import {
  FixtureStockHistory,
  FixtureStockHistorySchema,
} from './fixtureStockHistory.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { PackageType, PackageTypeSchema } from './packageType.schema';
import { Payment, PaymentSchema } from './payment.schema';
import { PaymentMethod, PaymentMethodSchema } from './paymentMethod.schema';
import { Product, ProductSchema } from './product.schema';
import {
  ProductStockHistory,
  ProductStockHistorySchema,
} from './productStockHistory.schema';
import { Service, ServiceSchema } from './service.schema';
import { ServiceInvoice, ServiceInvoiceSchema } from './serviceInvoice.schema';
import { Stock, StockSchema } from './stock.schema';
import { StockLocation, StockLocationSchema } from './stockLocation.schema';
import { Unit, UnitSchema } from './unit.schema';
import { Vendor, VendorSchema } from './vendor.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Product.name, useFactory: () => ProductSchema },
  { name: Fixture.name, useFactory: () => FixtureSchema },
  { name: Service.name, useFactory: () => ServiceSchema },
  { name: Unit.name, useFactory: () => UnitSchema },
  { name: ExpenseType.name, useFactory: () => ExpenseTypeSchema },
  { name: Brand.name, useFactory: () => BrandSchema },
  { name: Vendor.name, useFactory: () => VendorSchema },
  { name: StockLocation.name, useFactory: () => StockLocationSchema },
  { name: Stock.name, useFactory: () => StockSchema },
  { name: FixtureStock.name, useFactory: () => FixtureStockSchema },
  { name: CountList.name, useFactory: () => CountListSchema },
  { name: FixtureCountList.name, useFactory: () => FixtureCountListSchema },
  { name: Count.name, useFactory: () => CountSchema },
  { name: FixtureCount.name, useFactory: () => FixtureCountSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  { name: PackageType.name, useFactory: () => PackageTypeSchema },
  { name: PaymentMethod.name, useFactory: () => PaymentMethodSchema },
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
  createAutoIncrementConfig(FixtureInvoice.name, FixtureInvoiceSchema),
  createAutoIncrementConfig(ServiceInvoice.name, ServiceInvoiceSchema),
  createAutoIncrementConfig(
    ProductStockHistory.name,
    ProductStockHistorySchema,
  ),
  createAutoIncrementConfig(
    FixtureStockHistory.name,
    FixtureStockHistorySchema,
  ),
  createAutoIncrementConfig(Payment.name, PaymentSchema),
]);

@Module({
  imports: [mongooseModule, MenuModule, ActivityModule, GameModule],
  providers: [AccountingService],
  exports: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
