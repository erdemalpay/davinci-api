import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';

// Requests that reach us through the Shopify app proxy carry no JWT.
// kutuoyunual.com/apps/dv/* is forwarded to <api>/storefront/* (one proxy per app,
// shared by every storefront feature: loyalty, favorites, ...). Shopify signs the query string with the app secret and adds the
// logged-in customer's id, which is the only identity we trust here.
export const ShopifyAppProxy = () =>
  applyDecorators(Public(), UseGuards(ShopifyAppProxyGuard));

// Old signed links are refused so a captured URL can't be replayed for long.
const MAX_SIGNATURE_AGE_SECONDS = 15 * 60;

@Injectable()
export class ShopifyAppProxyGuard implements CanActivate {
  private readonly logger = new Logger(ShopifyAppProxyGuard.name);
  private readonly secret: string;

  constructor(configService: ConfigService) {
    const isProduction = process.env.NODE_ENV === 'production';
    this.secret =
      configService.get<string>(
        isProduction ? 'SHOPIFY_API_SECRET' : 'SHOPIFY_STAGING_API_SECRET',
      ) || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (
      !isValidAppProxySignature(
        request.query ?? {},
        this.secret,
        Math.floor(Date.now() / 1000),
      )
    ) {
      this.logger.warn(
        `Invalid Shopify app proxy signature on ${request.path}`,
      );
      throw new UnauthorizedException('Invalid app proxy signature');
    }
    return true;
  }
}

// https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
// Every query parameter except `signature` as `name=value`, sorted,
// (several values joined with a comma), concatenated without a separator and
// signed with HMAC-SHA256 (hex).
export function isValidAppProxySignature(
  query: Record<string, any>,
  secret: string,
  nowSeconds: number,
): boolean {
  const signature = query?.signature;
  if (!secret || typeof signature !== 'string' || !signature) {
    return false;
  }

  // Like Shopify's reference code, the `name=value` strings are sorted.
  const message = Object.keys(query)
    .filter((key) => key !== 'signature')
    .map((key) => {
      const value = query[key];
      return `${key}=${Array.isArray(value) ? value.join(',') : value ?? ''}`;
    })
    // Byte order, like Shopify's own reference (not locale order).
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join('');

  const expected = createHmac('sha256', secret).update(message).digest('hex');
  const provided = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (
    provided.length !== expectedBuffer.length ||
    !timingSafeEqual(provided, expectedBuffer)
  ) {
    return false;
  }

  const timestamp = Number(query.timestamp);
  return (
    Number.isFinite(timestamp) &&
    Math.abs(nowSeconds - timestamp) <= MAX_SIGNATURE_AGE_SECONDS
  );
}
