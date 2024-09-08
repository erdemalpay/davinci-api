import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';
import { ReservationController } from './reservation.controller';
import { ReservationGateway } from './reservation.gateway';
import { Reservation, ReservationSchema } from './reservation.schema';
import { ReservationService } from './reservation.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reservation.name, ReservationSchema),
]);
@Module({
  imports: [mongooseModule, GameplayModule],
  providers: [ReservationService, ReservationGateway],
  exports: [ReservationService, ReservationGateway],
  controllers: [ReservationController],
})
export class ReservationModule {}
