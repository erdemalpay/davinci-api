import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameModule } from 'src/modules/game/game.module';
import { ActivityModule } from '../activity/activity.module';
import { Location, LocationSchema } from '../location/location.schema';
import { MenuModule } from '../menu/menu.module';
import { CheckoutModule } from './../checkout/checkout.module';
import { AccountingController } from './accounting.controller';
import { AccountingGateway } from './accounting.gateway';
import { AccountingService } from './accounting.service';
import { Brand, BrandSchema } from './brand.schema';
import { Count, CountSchema } from './count.schema';
import { CountList, CountListSchema } from './countList.schema';
import { ExpenseType, ExpenseTypeSchema } from './expenseType.schema';
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
  { name: Service.name, useFactory: () => ServiceSchema },
  { name: Unit.name, useFactory: () => UnitSchema },
  { name: ExpenseType.name, useFactory: () => ExpenseTypeSchema },
  { name: Brand.name, useFactory: () => BrandSchema },
  { name: Vendor.name, useFactory: () => VendorSchema },
  { name: StockLocation.name, useFactory: () => StockLocationSchema },
  { name: Stock.name, useFactory: () => StockSchema },
  { name: CountList.name, useFactory: () => CountListSchema },
  { name: Count.name, useFactory: () => CountSchema },
  { name: Location.name, useFactory: () => LocationSchema },
  { name: PackageType.name, useFactory: () => PackageTypeSchema },
  { name: PaymentMethod.name, useFactory: () => PaymentMethodSchema },
  createAutoIncrementConfig(Invoice.name, InvoiceSchema),
  createAutoIncrementConfig(ServiceInvoice.name, ServiceInvoiceSchema),
  createAutoIncrementConfig(
    ProductStockHistory.name,
    ProductStockHistorySchema,
  ),
  createAutoIncrementConfig(Payment.name, PaymentSchema),
]);

@Module({
  imports: [
    mongooseModule,
    MenuModule,
    ActivityModule,
    GameModule,
    CheckoutModule,
  ],
  providers: [AccountingService, AccountingGateway],
  exports: [AccountingService, AccountingGateway],
  controllers: [AccountingController],
})
export class AccountingModule {}
