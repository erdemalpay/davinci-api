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
import { createHmac, timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';

export const SHOPIFY_HMAC_HEADER = 'x-shopify-hmac-sha256';

// Shopify webhooks carry no user JWT, so they skip the global guards and are
// authenticated by the HMAC signature Shopify computes over the raw body.
export const ShopifyWebhook = () =>
  applyDecorators(Public(), UseGuards(ShopifyWebhookGuard));

@Injectable()
export class ShopifyWebhookGuard implements CanActivate {
  private readonly logger = new Logger(ShopifyWebhookGuard.name);
  private readonly secret: string;
  private readonly enforce: boolean;

  constructor(configService: ConfigService) {
    const isProduction = process.env.NODE_ENV === 'production';
    // Webhooks created from the Shopify admin are signed with a separate
    // secret; webhooks created by the app are signed with the app secret.
    this.secret =
      configService.get<string>(
        isProduction
          ? 'SHOPIFY_WEBHOOK_SECRET'
          : 'SHOPIFY_STAGING_WEBHOOK_SECRET',
      ) ||
      configService.get<string>(
        isProduction ? 'SHOPIFY_API_SECRET' : 'SHOPIFY_STAGING_API_SECRET',
      ) ||
      '';
    // Set to "false" to only log failures while verifying the secret on a
    // new environment, so that real orders are not rejected.
    this.enforce =
      configService.get<string>('SHOPIFY_WEBHOOK_HMAC_ENFORCE') !== 'false';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers?.[SHOPIFY_HMAC_HEADER];
    const rawBody: Buffer | undefined = request.rawBody;

    if (
      isValidShopifyHmac(
        rawBody,
        typeof signature === 'string' ? signature : undefined,
        this.secret,
      )
    ) {
      return true;
    }

    const message = `Invalid Shopify webhook signature on ${request.method} ${request.path}`;
    if (!this.enforce) {
      this.logger.warn(`${message} (not enforced)`);
      return true;
    }
    this.logger.warn(message);
    throw new UnauthorizedException('Invalid webhook signature');
  }
}

export function isValidShopifyHmac(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'base64');
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
