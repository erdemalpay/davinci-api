import { Module, forwardRef } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { HepsiburadaController } from './hepsiburada.controller';
import { HepsiburadaService } from './hepsiburada.service';

@Module({
  imports: [forwardRef(() => MenuModule)],
  controllers: [HepsiburadaController],
  providers: [HepsiburadaService],
  exports: [HepsiburadaService],
})
export class HepsiburadaModule {}
