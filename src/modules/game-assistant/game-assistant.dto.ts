import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GameCard } from './assistant-tools';
import { GAME_ASSISTANT_LIMITS } from './game-assistant.constants';

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  // Asistan cevapları da geri gönderildiği için sınır cevap uzunluğuna göre;
  // kullanıcı mesajının 300 karakter sınırı servis içinde ayrıca kontrol edilir.
  @IsString()
  @MaxLength(GAME_ASSISTANT_LIMITS.maxReplyChars)
  text: string;
}

export class ChatDto {
  // Tarayıcıda üretilen anonim kimlik (ör. crypto.randomUUID()).
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  clientId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GAME_ASSISTANT_LIMITS.maxMessages)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GAME_ASSISTANT_LIMITS.maxShownGames)
  @IsInt({ each: true })
  shownGameIds?: number[];
}

export interface ChatResponse {
  text: string;
  games: GameCard[];
  fallbackToWizard: boolean;
}
