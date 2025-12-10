import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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

  constructor(private configService: ConfigService) {
    const { host, port }: DBConfig = config.get('redis');

    this.client = new Redis({
      host,
      port,
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

  async resetAll() {
    await this.client.flushall();
  }
}
