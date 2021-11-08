import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginCredentialsDto {
  @IsString()
  @MinLength(4, { message: 'username short'})
  @MaxLength(20)
  username: string;

  @IsString()
  @MinLength(4, { message: 'password short'})
  @MaxLength(20)
  password: string;
}
