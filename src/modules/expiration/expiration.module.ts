import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpirationController } from './expiration.controller';
import { ExpirationGateway } from './expiration.gateway';
import { ExpirationService } from './expiration.service';
import {
  ExpirationCount,
  ExpirationCountSchema,
} from './expirationCount.schema';
import { ExpirationList, ExpirationListSchema } from './expirationList.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: ExpirationList.name, useFactory: () => ExpirationListSchema },
  { name: ExpirationCount.name, useFactory: () => ExpirationCountSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [ExpirationService, ExpirationGateway],
  exports: [ExpirationService, ExpirationGateway],
  controllers: [ExpirationController],
})
export class ExpirationModule {}
