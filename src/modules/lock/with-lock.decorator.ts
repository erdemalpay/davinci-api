import { SetMetadata } from '@nestjs/common';

export const WITH_LOCK_METADATA = 'with_lock_metadata';

export interface WithLockOptions {
  /**
   * Lock key ya da key listesi.
   * Fonksiyon verilirse request objesi parametre olarak geçirilir.
   * String[] verilirse tüm keyler için acquireMultiple kullanılır.
   */
  key: string | string[] | ((req: any) => string | string[]);
  /** Redis'teki TTL süresi (saniye). Varsayılan: 10 */
  ttlSeconds?: number;
}

export const WithLock = (options: WithLockOptions) =>
  SetMetadata(WITH_LOCK_METADATA, options);
