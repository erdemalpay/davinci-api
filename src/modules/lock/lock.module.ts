import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { LockInterceptor } from './lock.interceptor';
import { LockService } from './lock.service';

@Module({
  imports: [RedisModule],
  providers: [LockService, LockInterceptor],
  exports: [LockService, LockInterceptor],
})
export class LockModule {}
