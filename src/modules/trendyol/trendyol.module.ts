import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TrendyolController } from './trendyol.controller';
import { TrendyolService } from './trendyol.service';

@Module({
  imports: [HttpModule],
  controllers: [TrendyolController],
  providers: [TrendyolService],
  exports: [TrendyolService],
})
export class TrendyolModule {}
