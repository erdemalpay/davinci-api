import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Location, LocationSchema } from '../location/location.schema';
import { MenuModule } from '../menu/menu.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { Count, CountSchema } from './count.schema';
import { CountList, CountListSchema } from './countList.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Fixture, FixtureSchema } from './fixture.schema';
import { FixtureInvoice, FixtureInvoiceSchema } from './fixtureInvoice.schema';
import { FixtureStock, FixtureStockSchema } from './fixtureStock.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { PackageType, PackageTypeSchema } from './packageType.schema';
import { Product, ProductSchema } from './product.schema';
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
  { name: Count.name, useFactory: () => CountSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  { name: PackageType.name, useFactory: () => PackageTypeSchema },
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
  createAutoIncrementConfig(FixtureInvoice.name, FixtureInvoiceSchema),
  createAutoIncrementConfig(ServiceInvoice.name, ServiceInvoiceSchema),
]);

@Module({
  imports: [mongooseModule, MenuModule],
  providers: [AccountingService],
  exports: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
