import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IntegrationRequestStatus,
  IntegrationSource,
} from './integration-request-log.schema';
import { IntegrationRequestLogService } from './integration-request-log.service';

export type LoggedRequestEntry = {
  method: string;
  endpoint: string;
  requestBody?: any;
  responseBody?: any;
  status: IntegrationRequestStatus;
  statusCode?: number;
  errorMessage?: string;
  durationMs: number;
};

// Pazaryeri istemcilerinin ortak kısmı: her istek IntegrationRequestLog'a
// yazılır ve canlı mağazaya yazma yalnızca production'da açıktır.
export abstract class LoggedHttpClient {
  protected readonly logger = new Logger(this.constructor.name);
  private static readonly MAX_LOGGED_BODY_BYTES = 100 * 1024;

  protected abstract readonly source: IntegrationSource;
  protected abstract readonly baseUrl: string;
  // Lokalde canlıya yazmayı açan ortam değişkeni (ör. N11_ALLOW_WRITES).
  protected abstract readonly allowWritesKey: string;
  protected abstract authHeaders(): Record<string, string>;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly http: HttpService,
    private readonly integrationRequestLogService: IntegrationRequestLogService,
  ) {}

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  // Sandbox kullanılmıyor: staging/lokal kendi stoğuyla canlı mağazayı ezmesin.
  get writesEnabled(): boolean {
    return (
      this.isProduction ||
      this.configService.get<string>(this.allowWritesKey) === 'true'
    );
  }

  assertWritesEnabled(): void {
    if (!this.writesEnabled) {
      throw new HttpException(
        `${this.source} writes are disabled outside production (set ${this.allowWritesKey}=true to test locally)`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: any;
      params?: any;
      // true dönerse başarılı cevap loglanmaz (boş polling cevapları için).
      skipSuccessLog?: (data: T) => boolean;
    } = {},
  ): Promise<T> {
    const { body, params, skipSuccessLog } = options;
    const startedAt = Date.now();
    try {
      const { data, status } = await firstValueFrom(
        this.http.request<T>({
          method,
          url: `${this.baseUrl}${path}`,
          ...(body !== undefined && { data: body }),
          ...(params && { params }),
          headers: {
            ...this.authHeaders(),
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }),
      );

      if (!skipSuccessLog?.(data)) {
        await this.logRequest({
          method,
          endpoint: path,
          requestBody: body ?? params,
          responseBody: data,
          status: IntegrationRequestStatus.SUCCESS,
          statusCode: status,
          durationMs: Date.now() - startedAt,
        });
      }
      return data;
    } catch (error) {
      await this.logRequest({
        method,
        endpoint: path,
        requestBody: body ?? params,
        responseBody: error?.response?.data,
        status: IntegrationRequestStatus.ERROR,
        statusCode: error?.response?.status,
        errorMessage: this.buildErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  // errorMessage şemada String; object yazılırsa log kaydı kaybolur.
  protected buildErrorMessage(error: any): string {
    const raw =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Unknown error';
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }

  private truncate(value: any): any {
    if (value === null || value === undefined) return undefined;
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (serialized === undefined) return undefined;
    const bytes = Buffer.byteLength(serialized);
    if (bytes <= LoggedHttpClient.MAX_LOGGED_BODY_BYTES) return value;
    return {
      __truncated: true,
      originalBytes: bytes,
      preview: serialized.slice(0, 2000),
    };
  }

  protected async logRequest(entry: LoggedRequestEntry): Promise<void> {
    try {
      await this.integrationRequestLogService.create({
        source: this.source,
        ...entry,
        requestBody: this.truncate(entry.requestBody),
        responseBody: this.truncate(entry.responseBody),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write ${this.source} request log for ${entry.method} ${
          entry.endpoint
        }: ${error?.message || error}`,
      );
    }
  }
}
