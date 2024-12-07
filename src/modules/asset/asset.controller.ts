import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssetService } from './asset.service';

@Controller('asset')
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Get('/folders')
  getAllFolders() {
    return this.assetService.getAllFolders();
  }

  @Get('/folder/images')
  getFolderImages(@Query('folderName') folderName: string) {
    return this.assetService.getFolderImages(folderName);
  }
  @Delete('image/*')
  deleteImage(@Param('0') path: string) {
    return this.assetService.deleteImage(path);
  }

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
