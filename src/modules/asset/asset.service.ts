import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cloudinary from 'cloudinary';
import * as streamifier from 'streamifier';
const api = cloudinary.v2;

@Injectable()
export class AssetService {
  constructor(configService: ConfigService) {
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
}
