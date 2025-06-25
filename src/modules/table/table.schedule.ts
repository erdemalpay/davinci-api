// table.schedule.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TableService } from './table.service';

@Injectable()
export class TableSchedule {
  private readonly logger: Logger = new Logger('TableSchedule');

  constructor(private readonly tableService: TableService) {}

  @Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryDayCheck() {
    this.logger.log('🔄 [Cron] Checking for unclosed tables…');
    await this.tableService.notifyUnclosedTables();
  }
  
  @Cron('0 0 1 * * *')
  async handleEveryMinuteCheck() {
    this.logger.log(`🔄 [Cron] Checking every minute ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
  
  @Cron('10 * 6 * * *')
  async handleEveryMinuteWithoutTimezoneCheck() {
    this.logger.log(`🔄 [Cron] Checking every minute with timezone with 6 ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
  
  @Cron('10 * 9 * * *')
  async handleEveryMinuteWithoutTimezoneCheck2() {
    this.logger.log(`🔄 [Cron] Checking every minute with timezone with 9 ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }

  @Cron('10 * 6 * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryMinuteWithTimezoneCheck() {
    this.logger.log(`🔄 [Cron] Checking every minute with timezone with 6 ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
  
  @Cron('10 * 9 * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryMinuteWithTimezoneCheck2() {
    this.logger.log(`🔄 [Cron] Checking every minute with timezone with 9 ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
}
