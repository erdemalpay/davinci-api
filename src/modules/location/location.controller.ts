import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
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
}
