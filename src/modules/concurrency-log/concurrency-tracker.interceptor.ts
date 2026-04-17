import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ConcurrentRequest } from './concurrency-log.schema';
import { ConcurrencyLogService } from './concurrency-log.service';

@Injectable()
export class ConcurrencyTrackerInterceptor implements NestInterceptor {
  private readonly inFlight = new Map<string, ConcurrentRequest[]>();

  constructor(
    private readonly concurrencyLogService: ConcurrencyLogService,
  ) {}

  private truncateBody(body: any, maxLength = 500): any {
    const str = JSON.stringify(body ?? {});
    if (str.length <= maxLength) return body;
    return { _truncated: true, preview: str.slice(0, maxLength) };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (!req) return next.handle();

    const method: string = req.method ?? 'UNKNOWN';
    if (method === 'GET') return next.handle();

    const routePath: string = req.route?.path ?? req.path ?? 'unknown';
    const key = `${method}:${routePath}`;
    const user = req.user;

    const entry: ConcurrentRequest = {
      userId: user?._id?.toString(),
      userName: user?.name,
      requestBody: this.truncateBody(req.body),
    };

    const list = this.inFlight.get(key) ?? [];
    list.push(entry);
    this.inFlight.set(key, list);

    if (list.length > 1) {
      void this.concurrencyLogService.create({
        method,
        endpoint: routePath,
        inFlightCount: list.length,
        requests: [...list],
      });
    }

    return next.handle().pipe(
      finalize(() => {
        const current = this.inFlight.get(key);
        if (current) {
          const idx = current.indexOf(entry);
          if (idx !== -1) current.splice(idx, 1);
          if (current.length === 0) {
            this.inFlight.delete(key);
          }
        }
      }),
    );
  }
}
