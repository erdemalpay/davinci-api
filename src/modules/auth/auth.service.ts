import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/modules/user/user.service';
import { User } from 'src/modules/user/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    return this.userService.validateCredentials(username, password);
  }

  async login(user: User) {
    const payload = {
      username: user.username,
      sub: user._id,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
