import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { Observable, from } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { RACE_CONDITION_LOCK_METADATA, RaceConditionLockOptions } from './race-condition-lock.decorator';
import { LockService } from './lock.service';

@Injectable()
export class LockInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly lockService: LockService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.getAllAndOverride<RaceConditionLockOptions>(
      RACE_CONDITION_LOCK_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const rawKey =
      typeof options.key === 'function' ? options.key(req) : options.key;

    const keys = Array.isArray(rawKey) ? rawKey : [rawKey];
    const ttlSeconds = options.ttlSeconds ?? 10;
    const lockValue = randomUUID();

    let acquired = false;

    return from(
      this.lockService.acquireMultiple(keys, lockValue, ttlSeconds),
    ).pipe(
      switchMap((ok) => {
        if (!ok) {
          throw new ConflictException(
            'Bu işlem zaten devam ediyor. Lütfen tekrar deneyin.',
          );
        }
        acquired = true;
        return next.handle();
      }),
      finalize(() => {
        if (acquired) {
          void this.lockService.releaseMultiple(keys, lockValue);
        }
      }),
    );
  }
}
