import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReservationService } from './reservation.service';
import { ReservationController } from './reservation.controller';
import { Reservation, ReservationSchema } from './reservation.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reservation.name, ReservationSchema),
]);
@Module({
  imports: [mongooseModule, GameplayModule],
  providers: [ReservationService],
  exports: [ReservationService],
  controllers: [ReservationController],
})
export class ReservationModule {}
