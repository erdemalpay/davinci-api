import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { UpstairsDutyController } from './upstairsDuty.controller';
import { UpstairsDuty, UpstairsDutySchema } from './upstairsDuty.schema';
import { UpstairsDutyService } from './upstairsDuty.service';

// Duties are started and ended by call assignment (ButtonCallModule).
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(UpstairsDuty.name, UpstairsDutySchema),
    ]),
  ],
  controllers: [UpstairsDutyController],
  providers: [UpstairsDutyService],
})
export class UpstairsDutyModule {}
