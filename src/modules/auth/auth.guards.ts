import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { normalizeLocale } from 'src/utils/normalizeLocale';

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
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );

    if (user) {
      const req = context.switchToHttp().getRequest();
      if (user.language) {
        req.i18nLang = normalizeLocale(user.language);
        console.log('req.i18nLang set to', req.i18nLang);
      }
      return user;
    }

    if (isPublic) return null;
    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
}
