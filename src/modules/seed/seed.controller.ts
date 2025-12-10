import { Controller, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('test-data')
  async seedTestData(@Query('location') location?: number) {
    const locationId = location ? Number(location) : 2;
    return this.seedService.seedTestData(locationId);
  }
}
