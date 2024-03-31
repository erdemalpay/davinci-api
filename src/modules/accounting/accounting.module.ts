import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Location, LocationSchema } from '../location/location.schema';
import { MenuModule } from '../menu/menu.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { Product, ProductSchema } from './product.schema';
import { Stock, StockSchema } from './stock.schema';
import { StockType, StockTypeSchema } from './stockType.schema';
import { Unit, UnitSchema } from './unit.schema';
import { Vendor, VendorSchema } from './vendor.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Product.name, useFactory: () => ProductSchema },
  { name: Unit.name, useFactory: () => UnitSchema },
  { name: ExpenseType.name, useFactory: () => ExpenseTypeSchema },
  { name: Brand.name, useFactory: () => BrandSchema },
  { name: Vendor.name, useFactory: () => VendorSchema },
  { name: StockType.name, useFactory: () => StockTypeSchema },
  { name: Stock.name, useFactory: () => StockSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
]);

@Module({
  imports: [mongooseModule, MenuModule],
  providers: [AccountingService],
  exports: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
