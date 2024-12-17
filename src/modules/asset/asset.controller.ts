import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
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
  deleteImage(@Param('0') url: string) {
    return this.assetService.deleteImage(url);
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

  @Post('uploads')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      // Allow up to 10 files
      limits: { fileSize: 1024 * 1024 * 5 }, // 5MB file size limit
    }),
  )
  uploadFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @ReqUser() user: User,
    @Body('foldername') foldername: string,
    @Body('itemId') itemId?: number,
  ) {
    return this.assetService.uploadImages(user, files, foldername, itemId);
  }
}
