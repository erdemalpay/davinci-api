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

export const HepsiburadaWebhook = () =>
  applyDecorators(Public(), UseGuards(HepsiburadaWebhookGuard));

// Hepsiburada calls our base URL with HTTP basic auth, using the username and
// password we shared with them when the webhook integration was set up.
@Injectable()
export class HepsiburadaWebhookGuard extends WebhookSenderGuard {
  private readonly username: string;
  private readonly password: string;
  private readonly knownCredentials: Record<string, string>;

  constructor(configService: ConfigService) {
    super(
      'Hepsiburada',
      configService.get<string>('HEPSIBURADA_WEBHOOK_ENFORCE') === 'true',
    );
    const environment =
      process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'STAGING';
    // Without separate webhook credentials, fall back to the username seen in
    // Hepsiburada's calls (our sender e-mail) and the secret key we call
    // Hepsiburada with.
    this.username =
      configService.get<string>(
        `HEPSIBURADA_${environment}_WEBHOOK_USERNAME`,
      ) ||
      configService.get<string>('DEFAULT_FROM_EMAIL') ||
      '';
    this.password =
      configService.get<string>(
        `HEPSIBURADA_${environment}_WEBHOOK_PASSWORD`,
      ) ||
      configService.get<string>(`HEPSIBURADA_${environment}_SECRET_KEY`) ||
      '';
    this.knownCredentials = knownSettings(configService, [
      'HEPSIBURADA_PRODUCTION_WEBHOOK_USERNAME',
      'HEPSIBURADA_PRODUCTION_WEBHOOK_PASSWORD',
      'HEPSIBURADA_STAGING_WEBHOOK_USERNAME',
      'HEPSIBURADA_STAGING_WEBHOOK_PASSWORD',
      'DEFAULT_FROM_EMAIL',
      'HEPSIBURADA_PRODUCTION_MERCHANT_ID',
      'HEPSIBURADA_STAGING_MERCHANT_ID',
      'HEPSIBURADA_PRODUCTION_SECRET_KEY',
      'HEPSIBURADA_STAGING_SECRET_KEY',
    ]);
  }

  protected rejectionReason(headers: WebhookHeaders): string | undefined {
    if (!this.username || !this.password) {
      return 'no credentials configured';
    }
    const authorization = headers.authorization;
    const encoded =
      typeof authorization === 'string'
        ? authorization.match(/^Basic\s+(.+)$/i)?.[1]
        : undefined;
    if (!encoded) {
      return 'basic authorization header missing';
    }
    const decoded = Buffer.from(encoded, 'base64').toString();
    const separator = decoded.indexOf(':');
    const providedUsername = decoded.slice(0, Math.max(separator, 0));
    const providedPassword = decoded.slice(separator + 1);
    if (
      secretsMatch(providedUsername, this.username) &&
      secretsMatch(providedPassword, this.password)
    ) {
      return undefined;
    }
    return `basic credentials do not match (username ${matchingSetting(
      providedUsername,
      this.knownCredentials,
    )}, password ${matchingSetting(providedPassword, this.knownCredentials)})`;
  }
}
