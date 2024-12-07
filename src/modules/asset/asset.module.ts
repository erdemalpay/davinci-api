import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetGateway } from './asset.gateway';
import { AssetService } from './asset.service';

@Module({
  providers: [AssetService, AssetGateway],
  exports: [AssetService, AssetGateway],
  controllers: [AssetController],
})
export class AssetModule {}
