import { Controller, Delete, Post, Query } from '@nestjs/common';
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

  @Delete('test-data')
  async clearTestData(
    @Query('location') location?: number,
    @Query('date') date?: string,
  ) {
    const locationId = location ? Number(location) : 2;
    return this.seedService.clearTestData(locationId, date);
  }
}
