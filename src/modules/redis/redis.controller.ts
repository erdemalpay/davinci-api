import { Controller, Get } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('/redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('/clear-cache')
  clearCache() {
    return this.redisService.resetAll();
  }
}
