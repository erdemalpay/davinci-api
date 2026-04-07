import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MenuModule } from './../menu/menu.module';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { UploadLog, UploadLogSchema } from './upload-log.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(UploadLog.name, UploadLogSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    forwardRef(() => MenuModule),
  ],
  providers: [AssetService],
  exports: [AssetService],
  controllers: [AssetController],
})
export class AssetModule {}
