import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssetService } from './asset.service';

@Controller('asset')
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1024 * 1024 * 5 }, // 5MB file size limit
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('filename') filename: string,
    @Body('foldername') foldername: string,
  ) {
    console.log(file);
    return this.assetService.uploadImage(file.buffer, filename, foldername);
  }
}
