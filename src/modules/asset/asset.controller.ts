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
import { Public } from '../auth/public.decorator';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { AssetService } from './asset.service';

const SCREEN_IMAGES_FOLDER = 'tv-screen';
const SCREEN_IMAGES_CACHE_TTL = 3600;

@Controller('asset')
export class AssetController {
  constructor(
    private readonly assetService: AssetService,
    private readonly redisService: RedisService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  @Get('/folders')
  getAllFolders() {
    return this.assetService.getAllFolders();
  }

  @Public()
  @Get('/screen-images')
  async getScreenImages() {
    const cached = await this.redisService.get(RedisKeys.ScreenImages);
    if (cached) {
      return cached;
    }

    const images = await this.assetService.getFolderImages(
      SCREEN_IMAGES_FOLDER,
    );
    const urls = images.map(({ url }) => ({ url }));
    await this.redisService.set(
      RedisKeys.ScreenImages,
      urls,
      SCREEN_IMAGES_CACHE_TTL,
    );
    return urls;
  }

  @Get('/upload-logs')
  getUploadLogs() {
    return this.assetService.getUploadLogs();
  }

  @Get('/folder/images')
  getFolderImages(@Query('folderName') folderName: string) {
    return this.assetService.getFolderImages(folderName);
  }
  @Delete('image/*')
  async deleteImage(@Param('0') url: string) {
    const result = await this.assetService.deleteImage(url);
    await this.websocketGateway.emitScreenImagesChanged();
    return result;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1024 * 1024 * 5 }, // 5MB file size limit
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('filename') filename: string,
    @Body('foldername') foldername: string,
  ) {
    console.log(file);
    const result = await this.assetService.uploadImage(
      file.buffer,
      filename,
      foldername,
    );
    await this.websocketGateway.emitScreenImagesChanged();
    return result;
  }

  @Post('upload/original')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1024 * 1024 * 5 },
    }),
  )
  uploadPopupFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('filename') filename: string,
    @Body('foldername') foldername: string,
  ) {
    return this.assetService.uploadPopupImage(file.buffer, filename, foldername);
  }

  @Post('uploads')
  @UseInterceptors(
    FilesInterceptor('files', 250, {
      // Allow up to 10 files
      limits: { fileSize: 1024 * 1024 * 100 }, // 5MB file size limit
    }),
  )
  async uploadFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @ReqUser() user: User,
    @Body('foldername') foldername: string,
    @Body('itemId') itemId?: string,
  ) {
    const result = await this.assetService.uploadImages(
      user,
      files,
      foldername,
      Number(itemId),
    );
    await this.websocketGateway.emitScreenImagesChanged();
    return result;
  }
}
