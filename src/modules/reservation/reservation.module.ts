import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';
import { ActivityModule } from './../activity/activity.module';
import { ReservationController } from './reservation.controller';
import { ReservationCronService } from './reservation.cron.service';
import { Reservation, ReservationSchema } from './reservation.schema';
import { ReservationService } from './reservation.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reservation.name, ReservationSchema),
]);
@Module({
  imports: [
    WebSocketModule,mongooseModule, GameplayModule, ActivityModule],
  providers: [ReservationService, ReservationCronService],
  exports: [ReservationService],
  controllers: [ReservationController],
})
export class ReservationModule {}
