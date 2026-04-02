import { IsEnum, IsString, Length } from 'class-validator';
import { RedeemChannel } from '../schemas/reward-code.schema';

export class RedeemCodeDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsEnum(RedeemChannel)
  channel: RedeemChannel;
}

export class ValidateCodeDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
