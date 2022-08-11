import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(_err: any, user: any, _info: any, context: any) {
    const allowAny = this.reflector.get<string[]>(
      'isPublic',
      context.getHandler(),
    );

    if (user) return user;
    if (allowAny) return null;
    throw new UnauthorizedException();
  }
}
