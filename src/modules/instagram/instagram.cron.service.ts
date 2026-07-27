import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InstagramService } from './instagram.service';

@Injectable()
export class InstagramCronService {
  private readonly logger = new Logger(InstagramCronService.name);

  constructor(private readonly instagramService: InstagramService) {}

  /**
   * Her Pazartesi 04:00'te (Europe/Istanbul) Instagram access token'ını yeniler.
   *
   * Token 60 gün geçerlidir; haftalık yenileme güvenli bir marj bırakır.
   */
  @Cron('0 0 4 * * 1', { timeZone: 'Europe/Istanbul' })
  async handleTokenRefresh() {
    this.logger.log('Starting scheduled task: Refresh Instagram access token');

    try {
      const { expiresAt } = await this.instagramService.refreshAccessToken();
      this.logger.log(
        `Instagram access token refreshed successfully, valid until ${expiresAt.toISOString()}`,
      );
      return { expiresAt };
    } catch (error) {
      this.logger.error(
        'Error in scheduled task: Refresh Instagram access token',
        error,
      );
    }
  }
}
