import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '../redis/redis.module';
import { InstagramToken, InstagramTokenSchema } from './instagram-token.schema';
import { InstagramController } from './instagram.controller';
import { InstagramCronService } from './instagram.cron.service';
import { InstagramService } from './instagram.service';

@Module({
  imports: [
    HttpModule,
    RedisModule,
    MongooseModule.forFeature([
      { name: InstagramToken.name, schema: InstagramTokenSchema },
    ]),
  ],
  providers: [InstagramService, InstagramCronService],
  controllers: [InstagramController],
})
export class InstagramModule {}
