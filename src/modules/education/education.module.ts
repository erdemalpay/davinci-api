import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EducationController } from './education.controller';
import { EducationGateway } from './education.gateway';
import { Education, EducationSchema } from './education.schema';
import { EducationService } from './education.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Education.name, schema: EducationSchema },
    ]),
  ],
  controllers: [EducationController],
  providers: [EducationService, EducationGateway],
  exports: [EducationService, EducationGateway],
})
export class EducationModule {}
