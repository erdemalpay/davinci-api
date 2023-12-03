import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MenuService } from '../menu/menu.service';
import { AssetService } from './asset.service';

@Controller('asset')
export class AssetController {
  constructor(
    private readonly assetService: AssetService,
    private readonly menuService: MenuService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('filename') filename: string,
  ) {
    console.log(file);
    const response = await this.assetService.uploadImage(file.buffer, filename);
    console.log({ response });
    return response;
  }
}
