import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cloudinary from 'cloudinary';
import * as streamifier from 'streamifier';
import { AssetGateway } from './asset.gateway';
const api = cloudinary.v2;

@Injectable()
export class AssetService {
  constructor(
    configService: ConfigService,
    private readonly assetGateway: AssetGateway,
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
        crop: 'scale',
        width: 800,
        height: 800,
      },
    };

    // Upload the image
    return new Promise((resolve, reject) => {
      let cld_upload_stream = cloudinary.v2.uploader.upload_stream(
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
      let nextCursor = null;

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

  async getFolderImages(folderName: string) {
    try {
      const result = await cloudinary.v2.search
        .expression(`folder:${folderName}`)
        .sort_by('public_id', 'desc')
        .execute();

      const images = await result?.resources?.map((image) => {
        return { url: image.secure_url, publicId: image.public_id };
      });
      return images;
    } catch (error) {
      console.error('Error fetching images:', error);
      throw Error(error);
    }
  }

  deleteImage = async (url) => {
    try {
      // Step 1: Decode the URL
      const decodedUrl = decodeURIComponent(url);

      // Step 2: Extract the public_id
      const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z]+$/;
      const match = regex.exec(decodedUrl);

      if (!match || !match[1]) {
        throw new Error('Invalid Cloudinary URL: Could not extract public_id.');
      }

      const publicId = match[1]; // Extracted public_id
      console.log('Extracted public_id:', publicId);

      // Step 3: Delete the image using the public_id
      const result = await cloudinary.v2.uploader.destroy(publicId);
      console.log('Image deleted:', result);
      this.assetGateway.emitAssetChanged(result);
      return result;
    } catch (error) {
      console.error('Error deleting image:', error.message);
      throw error;
    }
  };

  uploadImages = async (
    files: Array<Express.Multer.File>,
    foldername: string,
  ) => {
    const uploadPromises = files.map((file) => {
      const options = {
        public_id: `${file.originalname}`,
        use_filename: true,
        unique_filename: false,
        overwrite: true,
        folder: foldername,
        transformation: {
          crop: 'scale',
          width: 800,
          height: 800,
        },
      };

      return new Promise((resolve, reject) => {
        let cld_upload_stream = cloudinary.v2.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) {
              console.log('Upload Error:', error);
              reject(error);
            } else {
              console.log('Upload Result:', result);
              resolve(result);
            }
          },
        );

        streamifier.createReadStream(file.buffer).pipe(cld_upload_stream);
      });
    });

    return Promise.all(uploadPromises);
  };
}
