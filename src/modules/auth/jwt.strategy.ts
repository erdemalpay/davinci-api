import * as config from 'config';
import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from 'src/modules/user/user.service';

interface JwtPayload {
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private userService: UserService) {
    super({
      jwtFromRequest: (req: Request) => req.cookies?.jwt || null,
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    return this.userService.findByUsername(payload.username);
  }
}
