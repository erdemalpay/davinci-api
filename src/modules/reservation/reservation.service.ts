import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addHours, addMinutes, format } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { User } from '../user/user.schema';
import { ReservationDto } from './reservation.dto';
import { ReservationGateway } from './reservation.gateway';
import { Reservation } from './reservation.schema';

@Injectable()
export class ReservationService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
    private readonly reservationGateway: ReservationGateway,
    private readonly activityService: ActivityService,
  ) {}

  async create(user: User, reservationDto: ReservationDto) {
    const lastReservation = await this.reservationModel
      .findOne({})
      .sort({ order: 'desc' });
    const date = format(new Date(), 'yyyy-MM-dd');
    const reservation = await this.reservationModel.create({
      ...reservationDto,
      date,
      order: lastReservation?.order + 1 || 1,
    });
    this.reservationGateway.emitReservationChanged(user, reservation);
    this.activityService.addActivity(
      user,
      ActivityType.CREATE_RESERVATION,
      reservation,
    );
    return reservation;
  }

  async update(user: User, id: number, updates: UpdateQuery<Reservation>) {
    const oldReservation = await this.reservationModel.findById(id);
    const reservation = await this.reservationModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.reservationGateway.emitReservationChanged(user, reservation);
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_RESERVATION,
      oldReservation,
      reservation,
    );
    return reservation;
  }
  async updateReservationsOrder(user: User, id: number, newOrder: number) {
    const reservation = await this.reservationModel.findById(id);
    if (!reservation) {
      throw new HttpException('Reservation not found', HttpStatus.NOT_FOUND);
    }
    await this.reservationModel.findByIdAndUpdate(id, { order: newOrder });

    await this.reservationModel.updateMany(
      { _id: { $ne: id }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );

    this.reservationGateway.emitReservationChanged(user, reservation);
  }
  async callUpdate(user: User, id: number, updates: UpdateQuery<Reservation>) {
    const gmtPlus3Now = addHours(new Date(), 3);
    const callHour = format(gmtPlus3Now, 'HH:mm');
    const oldReservation = await this.reservationModel.findById(id);

    // Extract custom duration, default to 30 minutes
    const duration = (updates as any).comingDurationInMinutes ?? 30;

    // Remove comingDurationInMinutes from updates before passing to MongoDB
    const { comingDurationInMinutes, ...updateWithoutDuration } = updates as any;

    const reservation = await this.reservationModel.findByIdAndUpdate(
      id,
      {
        callHour,
        status: updateWithoutDuration.status,
        ...(updateWithoutDuration.status === 'Coming' && {
          approvedHour: format(gmtPlus3Now, 'HH:mm'),
          comingExpiresAt: addMinutes(gmtPlus3Now, duration),
        }),
        ...(updateWithoutDuration.status !== 'Coming' && {
          comingExpiresAt: null,
        }),
        $inc: { callCount: 1 },
      },
      { new: true },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_RESERVATION,
      oldReservation,
      reservation,
    );
    this.reservationGateway.emitReservationChanged(user, reservation);

    return reservation;
  }

  async findById(id: number): Promise<Reservation | undefined> {
    return this.reservationModel.findById(id);
  }

  async findByQuery(
    query: Partial<ReservationDto>,
  ): Promise<Reservation | undefined> {
    return this.reservationModel.findOne(query).sort({ order: 'desc' });
  }

  async find(
    query: Partial<ReservationDto>,
  ): Promise<Reservation[] | undefined> {
    return this.reservationModel.find(query).sort({ order: 'desc' });
  }

  async getByLocation(location: number, date: string): Promise<Reservation[]> {
    return this.reservationModel
      .find({ location, date })
      .sort({ order: 'desc' });
  }

  async cancelExpiredComingReservations() {
    const gmtPlus3Now = addHours(new Date(), 3);
    const expiredReservations = await this.reservationModel.find({
      status: 'Coming',
      comingExpiresAt: { $lt: gmtPlus3Now },
    });

    for (const reservation of expiredReservations) {
      const updatedReservation = await this.reservationModel.findByIdAndUpdate(
        reservation._id,
        {
          status: 'Cancelled',
          comingExpiresAt: null,
        },
        { new: true },
      );
      // Emit websocket event for each cancelled reservation
      this.reservationGateway.emitReservationChanged(null, updatedReservation);
    }

    return expiredReservations.length;
  }
}
