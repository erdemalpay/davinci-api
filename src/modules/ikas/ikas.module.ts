import { Module } from '@nestjs/common';
import { IkasController } from './ikas.controller';
import { IkasGateway } from './ikas.gateway';
import { IkasService } from './ikas.service';

@Module({
  providers: [IkasService, IkasGateway],
  exports: [IkasService, IkasGateway],
  controllers: [IkasController],
})
export class IkasModule {}
