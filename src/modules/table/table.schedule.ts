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
  
  @Cron('0 * * * * *')
  async handleEveryMinuteCheck() {
    this.logger.log(`🔄 [Cron] Checking every minute ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
  
  @Cron('10 * * * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryMinuteWithTimezoneCheck() {
    this.logger.log(`🔄 [Cron] Checking every minute with timezone ${new Date().toISOString()}`);
    await this.tableService.notifyUnclosedTables();
  }
}
