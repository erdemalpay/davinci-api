import { SetMetadata } from '@nestjs/common';

export const RACE_CONDITION_LOCK_METADATA = 'race_condition_lock_metadata';

export interface RaceConditionLockOptions {
  /**
   * Lock key ya da key listesi.
   * Fonksiyon verilirse request objesi parametre olarak geçirilir.
   * String[] verilirse tüm keyler için acquireMultiple kullanılır.
   */
  key: string | string[] | ((req: any) => string | string[]);
  /** Redis'teki TTL süresi (saniye). Varsayılan: 10 */
  ttlSeconds?: number;
}

export const RaceConditionLockDecorator = (options: RaceConditionLockOptions) =>
  SetMetadata(RACE_CONDITION_LOCK_METADATA, options);
