import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { IkasController } from './ikas.controller';
import { IkasGateway } from './ikas.gateway';
import { IkasService } from './ikas.service';

@Module({
  imports: [RedisModule, HttpModule],
  providers: [IkasService, IkasGateway],
  exports: [IkasService, IkasGateway],
  controllers: [IkasController],
})
export class IkasModule {}
