import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { Product, ProductSchema } from './product.schema';
import { Unit, UnitSchema } from './unit.schema';
import { Vendor, VendorSchema } from './vendor.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Product.name, ProductSchema),
  createAutoIncrementConfig(Unit.name, UnitSchema),
  createAutoIncrementConfig(ExpenseType.name, ExpenseTypeSchema),
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
  createAutoIncrementConfig(Brand.name, BrandSchema),
  createAutoIncrementConfig(Vendor.name, VendorSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [AccountingService],
  exports: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
