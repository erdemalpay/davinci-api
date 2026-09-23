import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PairingMode, TournamentFormat } from './tournament.round-plan';
import {
  ConfirmationStatus,
  RegistrationSource,
} from './schemas/tournament-registration.schema';

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

  @IsNumber()
  @Min(2)
  minTableSize: number;

  @IsNumber()
  @Min(0)
  leagueRounds: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  placementPoints: number[];

  @IsNumber()
  @Min(0)
  byePoints: number;

  @IsNumber()
  @Min(2)
  advanceCount: number;

  @IsNumber()
  @Min(1)
  advancePerTable: number;
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
