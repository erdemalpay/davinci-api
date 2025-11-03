import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationService } from './reservation.service';

@Injectable()
export class ReservationCronService {
  private readonly logger = new Logger(ReservationCronService.name);

  constructor(private readonly reservationService: ReservationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredComingReservations() {

    const cancelledCount =
      await this.reservationService.cancelExpiredComingReservations();
    if (cancelledCount > 0) {
      this.logger.log(`Cancelled ${cancelledCount} expired coming reservations`);
    }
  }
}