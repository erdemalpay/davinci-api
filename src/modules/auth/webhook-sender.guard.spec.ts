import {
  Controller,
  ExecutionContext,
  INestApplication,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HepsiburadaWebhook } from '../hepsiburada/hepsiburada-webhook.guard';
import {
  TRENDYOL_API_KEY_HEADER,
  TrendyolWebhook,
} from '../trendyol/trendyol-webhook.guard';
import { JwtAuthGuard } from './auth.guards';
import { WebhookSenderGuard } from './webhook-sender.guard';

class FakeWebhookGuard extends WebhookSenderGuard {
  constructor(enforce: boolean, private readonly reason?: string) {
    super('Fake', enforce);
  }

  protected rejectionReason(): string | undefined {
    return this.reason;
  }
}

describe('WebhookSenderGuard', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, method: 'POST', path: '/hook' }),
    }),
  } as unknown as ExecutionContext;

  function guardWith(enforce: boolean, reason?: string) {
    const guard = new FakeWebhookGuard(enforce, reason);
    const warn = jest
      .spyOn(guard['logger'], 'warn')
      .mockImplementation(() => undefined);
    return { guard, warn };
  }

  it('lets a verified request through without logging', () => {
    const { guard, warn } = guardWith(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  // Real orders must keep flowing until the credentials the marketplace sends
  // are known to match the configured ones, so nothing is rejected by default.
  it('when not enforced lets an unverified request through and logs why', () => {
    const { guard, warn } = guardWith(false, 'key does not match');

    expect(guard.canActivate(context)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Unverified Fake webhook on POST /hook: key does not match (not enforced)',
    );
  });

  it('when enforced rejects an unverified request and logs why', () => {
    const { guard, warn } = guardWith(true, 'key does not match');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(
      'Unverified Fake webhook on POST /hook: key does not match',
    );
  });
});

@Controller()
class WebhookTestController {
  @TrendyolWebhook()
  @Post('/trendyol-hook')
  trendyol() {
    return { received: 'trendyol' };
  }

  @HepsiburadaWebhook()
  @Post('/hepsiburada-hook')
  hepsiburada() {
    return { received: 'hepsiburada' };
  }
}

// Runs the guards inside a real Nest app, behind the same global JWT guard as
// main.ts, to prove the webhook routes still reach their handlers.
describe('marketplace webhook guards in a Nest app', () => {
  let app: INestApplication;

  async function startApp(config: Record<string, string>) {
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookTestController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    moduleRef.useLogger(false);
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    await app.init();
    return app.getHttpServer();
  }

  afterEach(async () => {
    await app?.close();
  });

  it('by default lets marketplace calls through without any credentials', async () => {
    const server = await startApp({});

    await request(server)
      .post('/trendyol-hook')
      .expect(201, { received: 'trendyol' });
    await request(server)
      .post('/hepsiburada-hook')
      .expect(201, { received: 'hepsiburada' });
  });

  it('when enforced rejects calls without the configured credentials', async () => {
    const server = await startApp({
      TRENDYOL_STAGING_WEBHOOK_API_KEY: 'key',
      TRENDYOL_WEBHOOK_ENFORCE: 'true',
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: 'user',
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: 'pass',
      HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
    });

    await request(server).post('/trendyol-hook').expect(401);
    await request(server).post('/hepsiburada-hook').expect(401);
  });

  it('when enforced accepts calls carrying the configured credentials', async () => {
    const server = await startApp({
      TRENDYOL_STAGING_WEBHOOK_API_KEY: 'key',
      TRENDYOL_WEBHOOK_ENFORCE: 'true',
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: 'user',
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: 'pass',
      HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
    });

    await request(server)
      .post('/trendyol-hook')
      .set(TRENDYOL_API_KEY_HEADER, 'key')
      .expect(201);
    await request(server)
      .post('/hepsiburada-hook')
      .auth('user', 'pass')
      .expect(201);
  });
});
