import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Anomaly, AnomalySchema } from './anomaly.schema';
import { AnomalyService } from './anomaly.service';
import { AnomalyController } from './anomaly.controller';
import { AnomalyCronService } from './anomaly.cron.service';
import { ActivityModule } from '../activity/activity.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Anomaly.name, AnomalySchema),
    ]),
    forwardRef(() => ActivityModule),
    forwardRef(() => NotificationModule),
    forwardRef(() => UserModule),
  ],
  controllers: [AnomalyController],
  providers: [AnomalyService, AnomalyCronService],
  exports: [AnomalyService],
})
export class AnomalyModule {}

