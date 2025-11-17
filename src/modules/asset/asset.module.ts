import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MenuModule } from './../menu/menu.module';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    WebSocketModule,MongooseModule, forwardRef(() => MenuModule)],
  providers: [AssetService],
  exports: [AssetService],
  controllers: [AssetController],
})
export class AssetModule {}
