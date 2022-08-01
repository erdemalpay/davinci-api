import { PartialType } from '@nestjs/swagger';
import { GameplayDto } from './gameplay.dto';

export class PartialGameplayDto extends PartialType(GameplayDto) {}
