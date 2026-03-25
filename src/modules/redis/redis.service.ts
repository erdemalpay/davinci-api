import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as config from 'config';
import Redis from 'ioredis';
export interface DBConfig {
  host: string;
  port: number;
  name: string;
}
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly redisHost: string;
  private readonly redisPort: number;

  constructor(private configService: ConfigService) {
    const { host, port }: DBConfig = config.get('redis');
    this.redisHost = host;
    this.redisPort = Number(port);

    this.client = new Redis({
      host,
      port,
    });
  }

  onModuleInit() {
    this.logger.log(
      `Initializing Redis client host=${this.redisHost} port=${this.redisPort} env=${process.env.NODE_ENV}`,
    );
    this.client.on('connect', () =>
      this.logger.log(
        `Redis client connected host=${this.redisHost} port=${this.redisPort}`,
      ),
    );
    this.client.on('ready', () =>
      this.logger.log(
        `Redis client ready host=${this.redisHost} port=${this.redisPort}`,
      ),
    );
    this.client.on('error', (error) =>
      this.logger.error(
        `Redis client error host=${this.redisHost} port=${
          this.redisPort
        } code=${(error as any)?.code ?? 'unknown'} message=${error?.message}`,
      ),
    );
  }

  onModuleDestroy() {
    this.client.quit();
  }
  getClient() {
    return this.client;
  }

  // Method to set data in Redis
  async set(key: string, value: any, ttl?: number): Promise<string> {
    if (ttl) {
      return this.client.set(key, JSON.stringify(value), 'EX', ttl);
    }
    return this.client.set(key, JSON.stringify(value));
  }

  // Method to get data from Redis
  async get(key: string): Promise<any> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Method to delete a single key or multiple keys
  async reset(...keys: string[]): Promise<number> {
    return await this.client.del(...keys);
  }

  // Method to delete keys by pattern
  async resetByPattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }
    return await this.client.del(...keys);
  }

  async resetAll() {
    await this.client.flushall();
  }

  // Acquire multiple locks atomically using a Lua script.
  // Returns true if all locks were acquired, false if any lock already exists.
  async acquireTableLocks(
    keys: string[],
    lockValue: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const luaScript = `
      for i = 1, #KEYS do
        if redis.call('EXISTS', KEYS[i]) == 1 then
          return 0
        end
      end
      for i = 1, #KEYS do
        redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
      end
      return 1
    `;
    const result = await this.client.eval(
      luaScript,
      keys.length,
      ...keys,
      lockValue,
      ttlSeconds,
    );
    return result === 1;
  }

  // Release locks that belong to us (matched by lockValue).
  async releaseTableLocks(keys: string[], lockValue: string): Promise<void> {
    const luaScript = `
      for i = 1, #KEYS do
        if redis.call('GET', KEYS[i]) == ARGV[1] then
          redis.call('DEL', KEYS[i])
        end
      end
      return 1
    `;
    await this.client.eval(luaScript, keys.length, ...keys, lockValue);
  }
}
