import { IsString } from 'class-validator';

export class CreateMembershipDto {
  name: string;
  startDate: string;
  endDate: string;
}

export class MembershipDto {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export class MembershipResponse {
  @IsString()
  name: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}
