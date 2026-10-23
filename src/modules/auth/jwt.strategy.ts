import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from 'src/modules/user/user.service';
import { isConsumerTokenPayload } from '../consumerApp/consumerToken';

interface JwtPayload {
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private userService: UserService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  // The user comes with its role. An unknown user is unauthorized; a
  // database error is not (see JwtAuthGuard.handleRequest).
  async validate(payload: JwtPayload) {
    // The customer app's token doesn't open the panel's routes.
    if (isConsumerTokenPayload(payload)) return null;
    return (await this.userService.findById(payload.username)) ?? null;
  }
}
