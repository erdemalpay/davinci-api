import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { CustomerPopupModule } from '../customer-popup/customer-popup.module';
import { MenuModule } from './../menu/menu.module';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { ScreenImage, ScreenImageSchema } from './screen-image.schema';
import { UploadLog, UploadLogSchema } from './upload-log.schema';
import { RedisModule } from '../redis/redis.module';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(UploadLog.name, UploadLogSchema),
  createAutoIncrementConfig(ScreenImage.name, ScreenImageSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    RedisModule,
    mongooseModule,
    forwardRef(() => MenuModule),
    CustomerPopupModule,
  ],
  providers: [AssetService],
  exports: [AssetService],
  controllers: [AssetController],
})
export class AssetModule {}
