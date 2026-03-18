import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Tek bir key için lock alır.
   * SET NX semantiği: key yoksa set eder ve true döner, varsa false döner.
   * lockValue verilmezse '1' kullanılır (idempotency lock gibi durumlarda yeterli).
   */
  async acquire(
    key: string,
    ttlSeconds: number,
    lockValue = '1',
  ): Promise<boolean> {
    const result = await this.redisService
      .getClient()
      .set(key, lockValue, 'EX', ttlSeconds, 'NX');
    return result !== null;
  }

  /**
   * Birden fazla key'i atomik olarak kilitler (Lua script).
   * Herhangi biri zaten kilitliyse hiçbirini kilitlemez → false döner.
   */
  async acquireMultiple(
    keys: string[],
    lockValue: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const luaScript = `
      if redis.call('EXISTS', unpack(KEYS)) > 0 then
        return 0
      end
      for i = 1, #KEYS do
        redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
      end
      return 1
    `;
    const result = await this.redisService
      .getClient()
      .eval(luaScript, keys.length, ...keys, lockValue, ttlSeconds);
    return result === 1;
  }

  /**
   * Tek bir key'in lock'ını serbest bırakır.
   * Sadece lockValue eşleşiyorsa siler (başka process'in lock'ını silmez).
   * lockValue verilmezse direkt siler (idempotency lock gibi durumlarda).
   */
  async release(key: string, lockValue?: string): Promise<void> {
    if (!lockValue) {
      await this.redisService.getClient().del(key).catch((e) =>
        this.logger.error(`Failed to release lock [${key}]:`, e),
      );
      return;
    }
    const luaScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    await this.redisService
      .getClient()
      .eval(luaScript, 1, key, lockValue)
      .catch((e) =>
        this.logger.error(`Failed to release lock [${key}]:`, e),
      );
  }

  /**
   * Birden fazla key'i atomik olarak serbest bırakır.
   * Sadece lockValue eşleşen key'leri siler.
   */
  async releaseMultiple(keys: string[], lockValue: string): Promise<void> {
    const luaScript = `
      local keys_to_delete = {}
      for i = 1, #KEYS do
        if redis.call('GET', KEYS[i]) == ARGV[1] then
          table.insert(keys_to_delete, KEYS[i])
        end
      end
      if #keys_to_delete > 0 then
        return redis.call('DEL', unpack(keys_to_delete))
      end
      return 0
    `;
    await this.redisService
      .getClient()
      .eval(luaScript, keys.length, ...keys, lockValue)
      .catch((e) =>
        this.logger.error(`Failed to release locks [${keys.join(', ')}]:`, e),
      );
  }

}
