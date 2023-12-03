import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';

@Module({
  imports: [MenuModule],
  providers: [AssetService],
  exports: [AssetService],
  controllers: [AssetController],
})
export class AssetModule {}
