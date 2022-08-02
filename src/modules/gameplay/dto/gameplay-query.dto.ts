import { PartialType } from '@nestjs/swagger';
import { GameplayDto } from './gameplay.dto';

export class GameplayQueryDto {
  location: string;
  field: string;
  limit: number;
  startDate: string;
  endDate?: string;
}
