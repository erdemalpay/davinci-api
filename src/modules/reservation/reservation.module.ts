import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';
import { ActivityModule } from './../activity/activity.module';
import { ReservationController } from './reservation.controller';
import { ReservationCronService } from './reservation.cron.service';
import { ReservationGateway } from './reservation.gateway';
import { Reservation, ReservationSchema } from './reservation.schema';
import { ReservationService } from './reservation.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reservation.name, ReservationSchema),
]);
@Module({
  imports: [mongooseModule, GameplayModule, ActivityModule],
  providers: [ReservationService, ReservationGateway, ReservationCronService],
  exports: [ReservationService, ReservationGateway],
  controllers: [ReservationController],
})
export class ReservationModule {}
