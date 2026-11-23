import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { PanelControlService } from '../panelControl/panelControl.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import {
  DEFAULT_DAILY_BUDGET_USD,
  GAME_ASSISTANT_LIMITS,
  MICRO_USD,
} from './game-assistant.constants';

const HOUR_SECONDS = 60 * 60;
const SPEND_TTL_SECONDS = 2 * 24 * HOUR_SECONDS;

@Injectable()
export class AssistantGuardService {
  constructor(
    private readonly redisService: RedisService,
    private readonly panelControlService: PanelControlService,
  ) {}

  // Harf/rakam yoksa (boş, sadece emoji/noktalama) ya da sadece link ise anlamsız sayılır.
  isMeaningless(text: string): boolean {
    const trimmed = text.trim();
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;
    return /^https?:\/\/\S+$/i.test(trimmed);
  }

  async isAvailable(): Promise<boolean> {
    const settings = await this.panelControlService.findPanelSettings();
    if (!settings?.isGameAssistantEnabled) return false;
    const budgetUsd =
      settings.gameAssistantDailyBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD;
    const spentMicroUsd = (await this.redisService.get(this.spendKey())) ?? 0;
    return spentMicroUsd < budgetUsd * MICRO_USD;
  }

  async isRateLimited(clientId: string, ip: string): Promise<boolean> {
    const hour = moment.tz('Europe/Istanbul').format('YYYY-MM-DD-HH');
    const base = `${RedisKeys.GameAssistantRate}:${hour}`;
    const clientCount = await this.redisService.increment(
      `${base}:client:${clientId}`,
      HOUR_SECONDS,
    );
    const ipCount = await this.redisService.increment(
      `${base}:ip:${ip}`,
      HOUR_SECONDS,
    );
    return (
      clientCount > GAME_ASSISTANT_LIMITS.clientMessagesPerHour ||
      ipCount > GAME_ASSISTANT_LIMITS.ipMessagesPerHour
    );
  }

  async addSpend(usd: number): Promise<void> {
    const microUsd = Math.round(usd * MICRO_USD);
    if (microUsd <= 0) return;
    await this.redisService.increment(
      this.spendKey(),
      SPEND_TTL_SECONDS,
      microUsd,
    );
  }

  private spendKey(): string {
    const day = moment.tz('Europe/Istanbul').format('YYYY-MM-DD');
    return `${RedisKeys.GameAssistantSpend}:${day}`;
  }
}
