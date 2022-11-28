import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Delete,
  Patch,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ReservationResponse, ReservationDto } from './reservation.dto';
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
  createReservation(@Body() reservationDto: ReservationDto) {
    return this.reservationService.create(reservationDto);
  }

  @Patch('/call/:id')
  @ApiResponse({ type: ReservationResponse })
  updateReservationCall(
    @Param('id') id: number,
    @Body() reservationDto: ReservationDto,
  ) {
    return this.reservationService.callUpdate(id, reservationDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: ReservationResponse })
  updateReservation(
    @Param('id') id: number,
    @Body() reservationDto: ReservationDto,
  ) {
    return this.reservationService.update(id, reservationDto);
  }
}
