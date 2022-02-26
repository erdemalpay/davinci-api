import { PartialType } from '@nestjs/swagger';
import { CreateGameplayDto } from './create-gameplay.dto';

export class UpdateGameplayDto extends PartialType(CreateGameplayDto) {}
