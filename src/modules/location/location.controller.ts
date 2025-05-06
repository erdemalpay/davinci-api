import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { CreateStockLocationDto } from './dto/create-location.dto';
import { Location } from './location.schema';
import { LocationService } from './location.service';
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  @Public()
  findStoreLocations() {
    return this.locationService.findStoreLocations();
  }

  @Post()
  createStockLocation(@Body() createStockLocation: CreateStockLocationDto) {
    return this.locationService.createStockLocation(createStockLocation);
  }
  s;
  @Get('/all')
  findAllLocations() {
    return this.locationService.findAllLocations();
  }
  @Get('/sell')
  findSellLocations() {
    return this.locationService.findSellLocations();
  }
  @Get('/stock')
  findStockLocations() {
    return this.locationService.findStockLocations();
  }

  @Post('/update-location-shifts')
  updateLocationShifts() {
    return this.locationService.updateLocationShifts();
  }

  @Patch('/:id')
  updateLocation(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Location>,
  ) {
    return this.locationService.updateLocation(id, updates);
  }
}
