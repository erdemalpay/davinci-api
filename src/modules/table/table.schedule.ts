// table.schedule.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TableService } from './table.service';

@Injectable()
export class TableSchedule {
  constructor(private readonly tableService: TableService) {}

  @Cron('0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleEveryMinuteCheck() {
    console.log('🔄 [Cron] Checking for unclosed tables…');
    await this.tableService.notifyUnclosedTables();
  }
}
