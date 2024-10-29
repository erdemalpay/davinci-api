import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });
  }

  onModuleInit() {
    this.client.on('connect', () => console.log('Redis client connected'));
    this.client.on('error', (error) =>
      console.error('Redis client error', error),
    );
  }

  onModuleDestroy() {
    this.client.quit();
  }

  // Method to set data in Redis
  async set(key: string, value: any): Promise<string> {
    return await this.client.set(key, JSON.stringify(value));
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
}
