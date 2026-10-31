import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import { CreatePanelSettingsDto } from './panelControl.dto';
import { PanelControlService } from './panelControl.service';

@Injectable()
export class PanelSettingsCronService {
  private readonly logger = new Logger(PanelSettingsCronService.name);

  constructor(private readonly panelControlService: PanelControlService) {}

  // "Today is holiday" is for one day: turned off at 02:00, after the
  // night's tables are open, so the next day's tables don't get the holiday
  // entry.
  @Cron('0 0 2 * * *', { timeZone: CAFE_TIME_ZONE })
  async endHoliday() {
    try {
      const settings = await this.panelControlService.findPanelSettings();
      if (!settings?.isHoliday) return;
      // Only the holiday changes (the panel sends partial settings too).
      await this.panelControlService.createPanelSetting({
        isHoliday: false,
      } as CreatePanelSettingsDto);
      this.logger.log('Holiday turned off for the new day');
    } catch (error) {
      this.logger.error('Failed to turn the holiday off', error);
    }
  }
}
