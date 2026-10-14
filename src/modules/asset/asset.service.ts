import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import * as cloudinary from 'cloudinary';
import { Model } from 'mongoose';
import * as streamifier from 'streamifier';
import { MenuService } from '../menu/menu.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { ScreenImageItemDto } from './asset.dto';
import { ScreenImage } from './screen-image.schema';
import { UploadLog } from './upload-log.schema';

const api = cloudinary.v2;

type ScreenImageResponse = { url: string; publicId: string; duration: number };

const SCREEN_IMAGES_FOLDER = 'tv-screen';
const DEFAULT_SCREEN_IMAGE_DURATION = 10; // seconds

@Injectable()
export class AssetService {
  constructor(
    configService: ConfigService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @InjectModel(UploadLog.name)
    private readonly uploadLogModel: Model<UploadLog>,
    @InjectModel(ScreenImage.name)
    private readonly screenImageModel: Model<ScreenImage>,
  ) {
    // Require the cloudinary library

    // Return "https" URLs by setting secure: true
    api.config({
      secure: true,
    });

    // Log the configuration
    console.log(
      api.config({
        cloud_name: configService.get('CLOUDINARY_CLOUD_NAME'),
        api_key: configService.get('CLOUDINARY_API_KEY'),
        api_secret: configService.get('CLOUDINARY_API_SECRET'),
      }),
    );
  }

  uploadImage = async (
    buffer: Buffer,
    fileName: string,
    foldername: string,
  ) => {
    // Use the uploaded file's name as the asset's public ID and
    // allow overwriting the asset with new versions
    const options = {
      public_id: fileName,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
      folder: foldername,
      transformation: {
        crop: 'limit',
        width: 800,
      },
    };

    // Upload the image
    return new Promise((resolve, reject) => {
      const cld_upload_stream = cloudinary.v2.uploader.upload_stream(
        options,
        function (error, result) {
          console.log(error, result);
          if (error) {
            reject(error);
          }
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(cld_upload_stream);
      /* const result = await api.uploader.upload(buffer, options);
      console.log(result);
      return result.public_id; */
    });
  };

  getAllFolders = async () => {
    try {
      let folders = [];
      const nextCursor = null;

      // Function to recursively fetch all folders
      async function fetchFolders(cursor) {
        const result = await cloudinary.v2.api.sub_folders(
          cursor ? cursor : '',
          { max_results: 500 },
        );
        folders = folders.concat(result.folders.map((folder) => folder.name));
        if (result.next_cursor) {
          await fetchFolders(result.next_cursor);
        }
      }

      await fetchFolders(nextCursor);
      return folders;
    } catch (error) {
      console.error('Error fetching folders:', error);
      throw Error(error);
    }
  };

  async getFolderImages(
    folderName: string,
  ): Promise<{ url: string; publicId: string }[]> {
    const allImages = [];
    let nextCursor: string | undefined;

    try {
      do {
        const result = await cloudinary.v2.search
          .expression(`folder:${folderName}`)
          .sort_by('public_id', 'desc')
          .max_results(50) // Ensure we fetch 50 images per page
          .next_cursor(nextCursor) // Pass the next_cursor if available
          .execute();

        const images = result.resources.map((image) => ({
          url: image.secure_url,
          publicId: image.public_id,
        }));
        allImages.push(...images);

        nextCursor = result.next_cursor;
      } while (nextCursor);
      return allImages;
    } catch (error) {
      console.error('Error fetching images:', error);
      throw new HttpException(
        error.message || 'Error fetching images',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async getScreenImageUrls(): Promise<
    { url: string; publicId: string }[]
  > {
    const urls: { url: string; publicId: string }[] = [];
    let nextCursor: string | undefined;

    try {
      do {
        const result = await cloudinary.v2.api.resources({
          type: 'upload',
          prefix: `${SCREEN_IMAGES_FOLDER}/`,
          max_results: 500,
          next_cursor: nextCursor,
        });
        urls.push(
          ...result.resources.map(({ secure_url, public_id }) => ({
            url: secure_url,
            publicId: public_id,
          })),
        );
        nextCursor = result.next_cursor;
      } while (nextCursor);
      return urls.reverse();
    } catch (error) {
      console.error('Error fetching screen images:', error);
      throw new HttpException(
        error.message || 'Error fetching screen images',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // Images without saved settings go to the end with the default duration.
  private async getOrderedScreenImages(): Promise<ScreenImageResponse[]> {
    const [images, settings] = await Promise.all([
      this.getScreenImageUrls(),
      this.screenImageModel.find().lean(),
    ]);
    const settingsByPublicId = new Map(
      settings.map((setting) => [setting.publicId, setting]),
    );
    const orderOf = (publicId: string) =>
      settingsByPublicId.get(publicId)?.order ?? Number.MAX_SAFE_INTEGER;

    return [...images]
      .sort((a, b) => orderOf(a.publicId) - orderOf(b.publicId))
      .map((image) => ({
        ...image,
        duration:
          settingsByPublicId.get(image.publicId)?.duration ??
          DEFAULT_SCREEN_IMAGE_DURATION,
      }));
  }

  async getScreenImages(): Promise<ScreenImageResponse[]> {
    try {
      const cachedImages = await this.redisService.get(RedisKeys.ScreenImages);
      if (cachedImages) {
        return cachedImages;
      }
    } catch (error) {
      console.error('Failed to retrieve screen images from Redis:', error);
    }

    const images = await this.getOrderedScreenImages();

    try {
      await this.redisService.set(RedisKeys.ScreenImages, images);
    } catch (error) {
      console.error('Failed to cache screen images in Redis:', error);
    }

    return images;
  }

  async updateScreenImages(images: ScreenImageItemDto[]) {
    // publicIds are unique (validated in the DTO), so the writes are independent
    await Promise.all(
      images.map(async ({ publicId, duration }, order) => {
        const updated = await this.screenImageModel.findOneAndUpdate(
          { publicId },
          { order, duration },
        );
        if (!updated) {
          await this.screenImageModel.create({ publicId, order, duration });
        }
      }),
    );
    await this.screenImageModel.deleteMany({
      publicId: { $nin: images.map(({ publicId }) => publicId) },
    });
    await this.websocketGateway.emitAssetChanged();
    return this.getScreenImages();
  }

  uploadPopupImage = async (
    buffer: Buffer,
    fileName: string,
    foldername: string,
  ) => {
    const options = {
      public_id: fileName,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
      folder: foldername,
      transformation: {
        crop: 'limit',
        width: 800,
      },
    };

    return new Promise((resolve, reject) => {
      const cld_upload_stream = cloudinary.v2.uploader.upload_stream(
        options,
        function (error, result) {
          if (error) reject(error);
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(cld_upload_stream);
    });
  };

  deleteImage = async (url) => {
    try {
      // Step 1: Decode the URL
      const decodedUrl = decodeURIComponent(url);

      // Step 2: Extract the public_id
      const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z]+$/;
      const match = regex.exec(decodedUrl);

      if (!match || !match[1]) {
        throw new HttpException(
          'Invalid Cloudinary URL: Could not extract public_id.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const publicId = match[1]; // Extracted public_id
      console.log('Extracted public_id:', publicId);

      // Step 3: Delete the image using the public_id
      const result = await cloudinary.v2.uploader.destroy(publicId);
      await this.screenImageModel.deleteOne({ publicId });
      this.websocketGateway.emitAssetChanged();
      return result;
    } catch (error) {
      console.error('Error deleting image:', error.message);
      throw new HttpException(
        error.message || 'Error deleting image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  };

  uploadImages = async (
    user: User,
    files: Array<Express.Multer.File>,
    foldername: string,
    itemId?: number,
  ) => {
    const uploadResults = await Promise.all(
      files.map(async (file) => {
        const options = {
          public_id: `${file.originalname}`,
          use_filename: true,
          unique_filename: false,
          overwrite: true,
          folder: foldername,
          transformation: {
            crop: 'limit',
            width: 800,
          },
        };

        try {
          const url = await new Promise<string>((resolve, reject) => {
            const cld_upload_stream = cloudinary.v2.uploader.upload_stream(
              options,
              (error, result) => {
                if (error) {
                  console.log('Upload Error:', error);
                  reject(error);
                } else {
                  console.log('Upload Result:', result);
                  resolve(result?.secure_url);
                }
              },
            );
            streamifier.createReadStream(file.buffer).pipe(cld_upload_stream);
          });

          await this.uploadLogModel.create({
            fileName: file.originalname,
            status: 'success',
            message: '',
            uploadedBy: user?.name ?? '',
            folder: foldername,
          });

          return url;
        } catch (error) {
          await this.uploadLogModel.create({
            fileName: file.originalname,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            uploadedBy: user?.name ?? '',
            folder: foldername,
          });

          return null;
        }
      }),
    );

    const imageUrls = uploadResults.filter((url): url is string => url !== null);
    this.websocketGateway.emitAssetChanged();

    try {
      if (itemId && imageUrls.length > 0) {
        const foundItem = await this.menuService.findItemById(itemId);
        if (!foundItem) {
          throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
        }
        console.log('Updating item with new images:', imageUrls);
        await this.menuService.updateItem(user, itemId, {
          ...foundItem.toObject(),
          productImages: [...(foundItem.productImages || []), ...imageUrls],
        });
      }

      return imageUrls;
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  };

  getUploadLogs = async () => {
    return this.uploadLogModel
      .find()
      .sort({ _id: -1 })
      .limit(50)
      .lean();
  };

  async getImageWithPublicID(publicId: string) {
    try {
      const result = await cloudinary.v2.api.resource(publicId);
      return result.secure_url ? result.secure_url : '';
    } catch (error) {
      if (error?.error?.http_code === 404 || error?.http_code === 404) {
        return '';
      }
      console.error(
        `Error fetching image ${publicId}:`,
        error?.error?.message ?? error?.message ?? 'unknown error',
      );
      throw Error(error?.error?.message ?? error?.message ?? 'unknown error');
    }
  }
}
