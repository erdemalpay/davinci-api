import { Module } from '@nestjs/common';
import { HepsiburadaController } from './hepsiburada.controller';
import { HepsiburadaService } from './hepsiburada.service';

@Module({
  controllers: [HepsiburadaController],
  providers: [HepsiburadaService],
  exports: [HepsiburadaService],
})
export class HepsiburadaModule {}
