import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';

@Module({
  imports: [HttpModule, RedisModule],
  providers: [InstagramService],
  controllers: [InstagramController],
})
export class InstagramModule {}

