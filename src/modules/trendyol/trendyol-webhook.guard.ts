import { applyDecorators, Injectable, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';
import {
  knownSettings,
  matchingSetting,
  secretsMatch,
  WebhookHeaders,
  WebhookSenderGuard,
} from '../auth/webhook-sender.guard';

export const TRENDYOL_API_KEY_HEADER = 'x-api-key';

export const TrendyolWebhook = () =>
  applyDecorators(Public(), UseGuards(TrendyolWebhookGuard));

// Our webhooks are registered on Trendyol with authenticationType API_KEY, so
// Trendyol sends that key in the x-api-key header of every call.
@Injectable()
export class TrendyolWebhookGuard extends WebhookSenderGuard {
  private readonly apiKey: string;
  private readonly knownKeys: Record<string, string>;

  constructor(configService: ConfigService) {
    super(
      'Trendyol',
      configService.get<string>('TRENDYOL_WEBHOOK_ENFORCE') === 'true',
    );
    const environment =
      process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'STAGING';
    // Like the Shopify guard falling back to the app secret, use the API key
    // we call Trendyol with when no separate webhook key is configured.
    this.apiKey =
      configService.get<string>(`TRENDYOL_${environment}_WEBHOOK_API_KEY`) ||
      configService.get<string>(`TRENDYOL_${environment}_API_KEY`) ||
      '';
    this.knownKeys = knownSettings(configService, [
      'TRENDYOL_PRODUCTION_WEBHOOK_API_KEY',
      'TRENDYOL_STAGING_WEBHOOK_API_KEY',
      'TRENDYOL_PRODUCTION_API_KEY',
      'TRENDYOL_STAGING_API_KEY',
      'TRENDYOL_PRODUCTION_API_SECRET',
      'TRENDYOL_STAGING_API_SECRET',
    ]);
  }

  protected rejectionReason(headers: WebhookHeaders): string | undefined {
    if (!this.apiKey) {
      return 'no api key configured';
    }
    const provided = headers[TRENDYOL_API_KEY_HEADER];
    if (typeof provided !== 'string' || !provided) {
      return 'x-api-key header missing';
    }
    return secretsMatch(provided, this.apiKey)
      ? undefined
      : `x-api-key does not match (${matchingSetting(
          provided,
          this.knownKeys,
        )})`;
  }
}
