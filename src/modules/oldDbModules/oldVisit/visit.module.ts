import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldVisitService } from './visit.service';
import { Visit, OldVisitSchema } from './visit.schema';

const mongooseModule = MongooseModule.forFeature(
  [{ name: Visit.name, schema: OldVisitSchema }],
  'olddb',
);

@Module({
  imports: [mongooseModule],
  providers: [OldVisitService],
  exports: [OldVisitService],
})
export class OldVisitModule {}
