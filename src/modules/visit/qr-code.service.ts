import { GoneException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class QrCodeService {
  private static readonly TTL_SECONDS = 12 * 60 * 60; // 12 saat

  constructor(
    private readonly redisService: RedisService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  private locKey(location: number) {
    return `${RedisKeys.QrLocation}:${location}`;
  }

  private codeKey(code: string) {
    return `${RedisKeys.QrCode}:${code}`;
  }

  private async generate(location: number): Promise<string> {
    const client = this.redisService.getClient();
    const oldCode = await client.get(this.locKey(location));
    if (oldCode) {
      await client.del(this.codeKey(oldCode));
    }
    const code = randomBytes(16).toString('hex');
    await client.set(
      this.locKey(location),
      code,
      'EX',
      QrCodeService.TTL_SECONDS,
    );
    await client.set(
      this.codeKey(code),
      String(location),
      'EX',
      QrCodeService.TTL_SECONDS,
    );
    return code;
  }

  private async rotateAndPush(location: number): Promise<void> {
    await this.generate(location);
    this.websocketGateway.emitQrCodeChanged();
  }

  async getCurrentCode(location: number): Promise<string> {
    const existing = await this.redisService
      .getClient()
      .get(this.locKey(location));
    return existing ?? this.generate(location);
  }

  async consume(code: string): Promise<number> {
    const raw = await this.redisService.getClient().getdel(this.codeKey(code));
    if (!raw) {
      throw new GoneException('QR code expired');
    }
    const location = Number(raw);
    await this.rotateAndPush(location);
    return location;
  }

  async rotateAllActive(): Promise<number> {
    const keys = await this.redisService
      .getClient()
      .keys(`${RedisKeys.QrLocation}:*`);
    for (const key of keys) {
      const location = Number(key.split(':').pop());
      if (!Number.isNaN(location)) {
        await this.rotateAndPush(location);
      }
    }
    return keys.length;
  }
}
