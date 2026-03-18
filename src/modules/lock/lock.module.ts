import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { LockService } from './lock.service';

@Module({
  imports: [RedisModule],
  providers: [LockService],
  exports: [LockService],
})
export class LockModule {}
