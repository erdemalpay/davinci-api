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
import {
  ExpenseCategory,
  ExpenseCategorySchema,
} from './expenseCategory.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { PackageType, PackageTypeSchema } from './packageType.schema';
import { Product, ProductSchema } from './product.schema';
import { Stock, StockSchema } from './stock.schema';
import { StockLocation, StockLocationSchema } from './stockLocation.schema';
import { StockType, StockTypeSchema } from './stockType.schema';
import { Unit, UnitSchema } from './unit.schema';

import { Vendor, VendorSchema } from './vendor.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Product.name, useFactory: () => ProductSchema },
  { name: Unit.name, useFactory: () => UnitSchema },
  { name: ExpenseType.name, useFactory: () => ExpenseTypeSchema },
  { name: ExpenseCategory.name, useFactory: () => ExpenseCategorySchema },
  { name: Brand.name, useFactory: () => BrandSchema },
  { name: Vendor.name, useFactory: () => VendorSchema },
  { name: StockType.name, useFactory: () => StockTypeSchema },
  { name: StockLocation.name, useFactory: () => StockLocationSchema },
  { name: Stock.name, useFactory: () => StockSchema },
  { name: CountList.name, useFactory: () => CountListSchema },
  { name: Count.name, useFactory: () => CountSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  { name: PackageType.name, useFactory: () => PackageTypeSchema },
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
]);

@Module({
  imports: [mongooseModule, MenuModule],
  providers: [AccountingService],
  exports: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
