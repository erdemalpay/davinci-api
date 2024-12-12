import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { Location } from './location.schema';
import { LocationService } from './location.service';
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @Public()
  findAll() {
    return this.locationService.findStoreLocations();
  }

  @Get('/stock')
  findStockLocations() {
    return this.locationService.findStockLocations();
  }

  @Patch('/:id')
  updateLocation(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Location>,
  ) {
    return this.locationService.updateLocation(id, updates);
  }
}
