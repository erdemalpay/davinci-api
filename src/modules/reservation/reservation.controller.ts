import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { ReservationDto, ReservationResponse } from './reservation.dto';
import { ReservationService } from './reservation.service';
@ApiTags('Reservation')
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Public()
  @ApiResponse({ type: [ReservationResponse] })
  @Get()
  getReservations(
    @Query('location') location: number,
    @Query('date') date: string,
  ) {
    return this.reservationService.getByLocation(location, date);
  }

  @Post()
  @ApiResponse({ type: ReservationResponse })
  createReservation(
    @ReqUser() user: User,
    @Body() reservationDto: ReservationDto,
  ) {
    return this.reservationService.create(user, reservationDto);
  }
  @Patch('/reservations_order/:id')
  updateReservationsOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.reservationService.updateReservationsOrder(
      user,
      id,
      payload.newOrder,
    );
  }
  @Patch('/call/:id')
  @ApiResponse({ type: ReservationResponse })
  updateReservationCall(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() reservationDto: ReservationDto,
  ) {
    return this.reservationService.callUpdate(user, id, reservationDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: ReservationResponse })
  updateReservation(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() reservationDto: ReservationDto,
  ) {
    return this.reservationService.update(user, id, reservationDto);
  }
}
