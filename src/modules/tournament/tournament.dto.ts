import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Tiebreaker } from './tournament.fixture';
import { PairingMode, TournamentFormat } from './tournament.round-plan';
import {
  ConfirmationStatus,
  RegistrationSource,
} from './schemas/tournament-registration.schema';

// Formata bağlı alanlar isteğe bağlı; hangisinin zorunlu olduğunu servis denetler
export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  game?: number;

  @IsOptional()
  @IsNumber()
  location?: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime HH:mm biçiminde olmalı',
  })
  startTime?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsEnum(TournamentFormat)
  format: TournamentFormat;

  @IsOptional()
  @IsEnum(PairingMode)
  pairingMode?: PairingMode;

  @IsNumber()
  @Min(2)
  tableSize: number;

  // Eleme aşamasında farklı masa (ör. puan turları 4'lük, eleme 2'lik); boşsa tableSize
  @IsOptional()
  @IsNumber()
  @Min(2)
  eliminationTableSize?: number;

  @IsOptional()
  @IsBoolean()
  thirdPlaceMatch?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(2)
  minTableSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leagueRounds?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  placementPoints?: number[];

  // Eksik kurulan masaların puanları, masa büyüklüğüne göre: { 3: [4, 1, 0] }
  @IsOptional()
  @IsObject()
  placementPointsBySize?: Record<number, number[]>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  byePoints?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  advanceCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  advancePerTable?: number;

  // Tur süresi (dk); boşsa süre sınırı yok
  @IsOptional()
  @IsNumber()
  @Min(1)
  roundDuration?: number;

  @IsOptional()
  @IsEnum(Tiebreaker)
  tiebreaker?: Tiebreaker;

  @IsOptional()
  @IsNumber()
  @Min(1)
  scoreCap?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waitlistCapacity?: number;

  @IsOptional()
  @IsBoolean()
  hasEntryFee?: boolean;

  @IsOptional()
  @IsString()
  participationNote?: string;

  @IsOptional()
  @IsString()
  waitlistNote?: string;
}

export class RegisterTournamentDto {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(RegistrationSource)
  source?: RegistrationSource;
}

export class UpdateConfirmationDto {
  @IsEnum(ConfirmationStatus)
  confirmationStatus: ConfirmationStatus;
}

export class PromoteRegistrationsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  registrationIds: number[];
}

export class AddParticipantDto {
  @IsString()
  name: string;
}

export class CheckInDto {
  @IsString()
  code: string;
}

export class UpdateParticipantDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Sadece çekilen oyuncuyu geri almak için; çıkarma removeParticipant'tan geçer
  @IsOptional()
  @Equals(true)
  isActive?: boolean;
}

export class MoveParticipantDto {
  @IsNumber()
  matchId: number;

  // Hedef masadaki bu oyuncuyla yer değiştirir; boşsa hedef masaya taşınır
  @IsOptional()
  @IsNumber()
  swapWithId?: number;
}

export class MatchScoreDto {
  @IsNumber()
  participantId: number;

  @IsNumber()
  score: number;
}

export class SubmitScoresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchScoreDto)
  scores: MatchScoreDto[];
}

export class ResolveTieDto {
  @IsArray()
  @IsNumber({}, { each: true })
  winnerIds: number[];

  // Puan turlarında beraberlik bırakılırsa eşitlere elle verilen puan; boşsa sıranın puanı
  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;
}
