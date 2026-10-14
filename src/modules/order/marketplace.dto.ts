import { ArrayNotEmpty, IsArray, IsNumber } from 'class-validator';

export class MatchMarketplaceItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  itemIds: number[];
}
