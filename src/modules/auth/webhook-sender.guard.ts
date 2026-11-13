import {
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

export type WebhookHeaders = Record<string, string | string[] | undefined>;

// Marketplace webhooks carry no user JWT, so they skip the global guards and
// are authenticated by the credentials the marketplace sends with each call.
export abstract class WebhookSenderGuard implements CanActivate {
  protected readonly logger = new Logger(this.constructor.name);

  // Requests are only rejected once `enforce` is on: until the configured
  // credentials are known to match what the marketplace sends, a mismatch is
  // logged and the request goes through, so that real orders are not lost.
  protected constructor(
    private readonly source: string,
    private readonly enforce: boolean,
  ) {}

  // Why the sender could not be verified, or undefined when it was. Must not
  // contain the credentials themselves: it is written to the log.
  protected abstract rejectionReason(
    headers: WebhookHeaders,
  ): string | undefined;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const reason = this.rejectionReason(request.headers ?? {});
    if (!reason) {
      return true;
    }

    const message = `Unverified ${this.source} webhook on ${request.method} ${request.path}: ${reason}`;
    if (!this.enforce) {
      this.logger.warn(`${message} (not enforced)`);
      return true;
    }
    this.logger.warn(message);
    throw new UnauthorizedException('Invalid webhook credentials');
  }
}

// Reads the given settings, leaving out the ones that are not set.
export function knownSettings(
  configService: ConfigService,
  names: string[],
): Record<string, string> {
  return Object.fromEntries(
    names
      .map((name) => [name, configService.get<string>(name) || ''])
      .filter(([, value]) => value),
  );
}

// Names the known setting a received credential equals, so that a mismatch can
// be traced (e.g. the webhook was registered with the production key) without
// writing the credential itself to the log.
export function matchingSetting(
  provided: string | undefined,
  settings: Record<string, string>,
): string {
  const name = Object.keys(settings).find((key) =>
    secretsMatch(provided, settings[key]),
  );
  return name ? `matches ${name}` : 'matches no known setting';
}

// An empty expected secret never matches, so an unconfigured guard cannot be
// passed by sending an empty value.
export function secretsMatch(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
