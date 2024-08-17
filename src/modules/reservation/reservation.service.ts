import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addHours, format } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { ReservationDto } from './reservation.dto';
import { Reservation } from './reservation.schema';

@Injectable()
export class ReservationService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
  ) {}

  async create(reservationDto: ReservationDto) {
    return this.reservationModel.create(reservationDto);
  }

  async update(id: number, updates: UpdateQuery<Reservation>) {
    return this.reservationModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }

  async callUpdate(id: number, updates: UpdateQuery<Reservation>) {
    const gmtPlus3Now = addHours(new Date(), 3);
    const callHour = format(gmtPlus3Now, 'HH:mm');
    return this.reservationModel.findByIdAndUpdate(
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
  }

  async findById(id: number): Promise<Reservation | undefined> {
    return this.reservationModel.findById(id);
  }

  async findByQuery(
    query: Partial<ReservationDto>,
  ): Promise<Reservation | undefined> {
    return this.reservationModel.findOne(query);
  }

  async getByLocation(location: number, date: string): Promise<Reservation[]> {
    return this.reservationModel.find({ location, date });
  }
}
