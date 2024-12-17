import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MenuModule } from './../menu/menu.module';
import { AssetController } from './asset.controller';
import { AssetGateway } from './asset.gateway';
import { AssetService } from './asset.service';

@Module({
  imports: [MongooseModule, MenuModule],
  providers: [AssetService, AssetGateway],
  exports: [AssetService, AssetGateway],
  controllers: [AssetController],
})
export class AssetModule {}
