import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScreenImageItemDto {
  @IsString()
  publicId: string;

  // Seconds
  @IsInt()
  @Min(1)
  duration: number;
}

// Images in display order
export class UpdateScreenImagesDto {
  @IsArray()
  @ArrayUnique((image: ScreenImageItemDto) => image.publicId)
  @ValidateNested({ each: true })
  @Type(() => ScreenImageItemDto)
  images: ScreenImageItemDto[];
}
