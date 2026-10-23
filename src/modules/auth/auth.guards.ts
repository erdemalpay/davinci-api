import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { normalizeLocale } from 'src/utils/normalizeLocale';
import { CONSUMER_PROTECTED_METADATA } from '../consumerApp/consumerToken';
import { API_TOKEN_CONFIG_KEY_METADATA } from './api-token.guard';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) return true;
    const apiTokenConfigKey = this.reflector.getAllAndOverride<string>(
      API_TOKEN_CONFIG_KEY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (apiTokenConfigKey) return true;
    const isConsumerProtected = this.reflector.getAllAndOverride<boolean>(
      CONSUMER_PROTECTED_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isConsumerProtected) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );

    // The token couldn't be checked (e.g. the database timed out at a busy
    // hour). Not a 401: the panel logs people out on a 401.
    if (err && !(err instanceof HttpException)) {
      this.logger.error('Could not check the token', err);
      throw new ServiceUnavailableException('Could not check the session');
    }

    if (user) {
      const req = context.switchToHttp().getRequest();
      if (user.language) {
        req.i18nLang = normalizeLocale(user.language);
      }
      return user;
    }

    if (isPublic) return null;
    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
}
