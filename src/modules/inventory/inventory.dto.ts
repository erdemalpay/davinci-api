import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  Max,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateInventoryLocationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateInventoryBoxesDto {
  @IsInt()
  game: number;

  @IsInt()
  location: number;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @IsOptional()
  @IsString()
  shortCode?: string;
}

export class MoveInventoryBoxesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @IsNumber()
  location: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DeactivateInventoryBoxesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @IsOptional()
  @IsString()
  note?: string;
}
