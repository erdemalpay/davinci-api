import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { CustomerPopupController } from './customer-popup.controller';
import { CustomerPopup, CustomerPopupSchema } from './customer-popup.schema';
import { CustomerPopupService } from './customer-popup.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(CustomerPopup.name, CustomerPopupSchema),
]);

@Module({
  imports: [mongooseModule],
  controllers: [CustomerPopupController],
  providers: [CustomerPopupService],
  exports: [CustomerPopupService],
})
export class CustomerPopupModule {}
