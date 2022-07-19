import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginCredentialsDto {
  @IsString()
  @MaxLength(20)
  username: string;

  @IsString()
  @MaxLength(20)
  password: string;
}
