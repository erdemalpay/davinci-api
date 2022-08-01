import { PartialType } from '@nestjs/swagger';
import { GameplayDto } from './gameplay.dto';

export class GameplayQueryDto extends PartialType(GameplayDto) {
  field: string;
  limit: number;
  startDate: string;
  endDate?: string;
}
