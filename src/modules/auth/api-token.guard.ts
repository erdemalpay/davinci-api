import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';

export const API_TOKEN_CONFIG_KEY_METADATA = 'apiTokenConfigKey';

export const ApiTokenProtected = (configKey: string) =>
  applyDecorators(
    SetMetadata(API_TOKEN_CONFIG_KEY_METADATA, configKey),
    UseGuards(ApiTokenGuard),
  );

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const configKey = this.reflector.getAllAndOverride<string>(
      API_TOKEN_CONFIG_KEY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const expectedToken = configKey
      ? this.configService.get<string>(configKey)
      : undefined;
    const request = context.switchToHttp().getRequest();
    const providedToken = this.getTokenFromRequest(request);

    if (!expectedToken || !providedToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!this.tokensMatch(providedToken, expectedToken)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }

  private getTokenFromRequest(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const authorization = request.headers?.authorization;
    const bearerToken =
      typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
        : undefined;

    if (bearerToken) {
      return bearerToken;
    }

    const apiToken = request.headers?.['x-api-token'];
    return Array.isArray(apiToken) ? apiToken[0] : apiToken;
  }

  private tokensMatch(providedToken: string, expectedToken: string): boolean {
    const providedBuffer = Buffer.from(providedToken);
    const expectedBuffer = Buffer.from(expectedToken);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
