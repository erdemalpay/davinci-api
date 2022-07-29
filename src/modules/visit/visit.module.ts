import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { VisitController } from './visit.controller';
import { Visit, VisitSchema } from './visit.schema';
import { VisitService } from './visit.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Visit.name, VisitSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [VisitService],
  exports: [VisitService],
  controllers: [VisitController],
})
export class VisitModule {}
