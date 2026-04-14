import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ConcurrencyLogService } from './concurrency-log.service';

@Injectable()
export class ConcurrencyTrackerInterceptor implements NestInterceptor {
  private readonly inFlight = new Map<string, number>();

  constructor(
    private readonly concurrencyLogService: ConcurrencyLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (!req) return next.handle();

    const method: string = req.method ?? 'UNKNOWN';
    if (method === 'GET') return next.handle();

    const routePath: string = req.route?.path ?? req.path ?? 'unknown';
    const key = `${method}:${routePath}`;

    const count = (this.inFlight.get(key) ?? 0) + 1;
    this.inFlight.set(key, count);

    if (count > 1) {
      const user = req.user;
      void this.concurrencyLogService.create({
        method,
        endpoint: routePath,
        inFlightCount: count,
        userId: user?._id?.toString(),
        userName: user?.name,
      });
    }

    return next.handle().pipe(
      finalize(() => {
        const current = this.inFlight.get(key) ?? 1;
        const next = Math.max(0, current - 1);
        if (next === 0) {
          this.inFlight.delete(key);
        } else {
          this.inFlight.set(key, next);
        }
      }),
    );
  }
}
