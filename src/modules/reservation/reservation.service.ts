import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addHours, format } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { ReservationDto } from './reservation.dto';
import { ReservationGateway } from './reservation.gateway';
import { Reservation } from './reservation.schema';
@Injectable()
export class ReservationService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
    private readonly reservationGateway: ReservationGateway,
  ) {}

  async create(user: User, reservationDto: ReservationDto) {
    const reservation = await this.reservationModel.create(reservationDto);
    this.reservationGateway.emitReservationChanged(user, reservation);
    return reservation;
  }

  async update(user: User, id: number, updates: UpdateQuery<Reservation>) {
    const reservation = await this.reservationModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.reservationGateway.emitReservationChanged(user, reservation);
    return reservation;
  }

  async callUpdate(user: User, id: number, updates: UpdateQuery<Reservation>) {
    const gmtPlus3Now = addHours(new Date(), 3);
    const callHour = format(gmtPlus3Now, 'HH:mm');
    const reservation = await this.reservationModel.findByIdAndUpdate(
      id,
      {
        callHour,
        status: updates.status,
        ...(updates.status === 'Coming' && {
          approvedHour: format(gmtPlus3Now, 'HH:mm'),
        }),
        $inc: { callCount: 1 },
      },
      { new: true },
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
    return this.reservationModel.findOne(query);
  }

  async find(
    query: Partial<ReservationDto>,
  ): Promise<Reservation[] | undefined> {
    return this.reservationModel.find(query);
  }

  async getByLocation(location: number, date: string): Promise<Reservation[]> {
    return this.reservationModel.find({ location, date });
  }
}
