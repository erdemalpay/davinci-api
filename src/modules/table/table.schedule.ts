// table.schedule.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { TableService } from './table.service';

@Injectable()
export class TableSchedule {
  private readonly logger: Logger = new Logger('TableSchedule');

  constructor(
    private readonly tableService: TableService,
    private readonly redisService: RedisService,
  ) {}

  @Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryDayCheck() {
    this.logger.log('🔄 [Cron] Checking for unclosed tables…');
    await this.tableService.notifyUnclosedTables();
  }

  @Cron('0 30 1 * * *', { timeZone: 'Europe/Istanbul' })
  async clearTableCache() {
    this.logger.log('🧹 [Cron] Clearing table cache…');
    try {
      const deletedCount = await this.redisService.resetByPattern(
        `${RedisKeys.Tables}:*`,
      );
      this.logger.log(
        `✅ [Cron] Table cache cleared. ${deletedCount} keys deleted.`,
      );
    } catch (error) {
      this.logger.error('❌ [Cron] Failed to clear table cache:', error);
    }
  }
}
