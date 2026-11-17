import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { gunzipSync } from 'zlib';
import { IntegrationSource } from '../integration-request-log/integration-request-log.schema';
import { IntegrationRequestLogService } from '../integration-request-log/integration-request-log.service';
import { LoggedHttpClient } from '../integration-request-log/logged-http.client';
import {
  AMAZON_BASE_URL,
  AMAZON_MARKETPLACE_ID,
  AMAZON_TOKEN_URL,
  AMAZON_USER_AGENT,
  AmazonReport,
  AmazonReportDocument,
} from './amazon.dto';

// Access token bitiminden bu kadar önce yenilenir.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const REPORT_POLL_INTERVAL_MS = 5 * 1000;
const REPORT_MAX_POLLS = 36;

// Amazon SP-API yalnızca okunur; sipariş ve FBA stoğu çekilir. Kimlik doğrulama
// LWA ile yapılır: refresh token ile ~1 saatlik access token alınır.
@Injectable()
export class AmazonClient extends LoggedHttpClient {
  protected readonly source = IntegrationSource.AMAZON;
  protected readonly baseUrl = AMAZON_BASE_URL;
  // Amazon'a hiçbir şey yazılmıyor; anahtar yalnızca temel sınıf için gerekli.
  protected readonly allowWritesKey = 'AMAZON_ALLOW_WRITES';
  private accessToken = '';
  private tokenExpiresAt = 0;
  private tokenRequest: Promise<void> | null = null;

  constructor(
    configService: ConfigService,
    http: HttpService,
    integrationRequestLogService: IntegrationRequestLogService,
  ) {
    super(configService, http, integrationRequestLogService);
  }

  protected authHeaders() {
    return {
      'x-amz-access-token': this.accessToken,
      'user-agent': AMAZON_USER_AGENT,
    };
  }

  async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: any;
      params?: any;
      skipSuccessLog?: (data: T) => boolean;
    } = {},
  ): Promise<T> {
    await this.ensureAccessToken();
    return super.request<T>(method, path, options);
  }

  // Rapor istenir, hazır olana kadar beklenir ve metin olarak döner. Amazon
  // raporlanacak veri yoksa isteği iptal eder; bu durumda boş metin döner.
  async getReport(reportType: string, start: Date, end: Date): Promise<string> {
    const { reportId } = await this.request<{ reportId: string }>(
      'POST',
      '/reports/2021-06-30/reports',
      {
        body: {
          reportType,
          marketplaceIds: [AMAZON_MARKETPLACE_ID],
          dataStartTime: start.toISOString(),
          dataEndTime: end.toISOString(),
        },
      },
    );

    for (let poll = 0; poll < REPORT_MAX_POLLS; poll++) {
      const report = await this.request<AmazonReport>(
        'GET',
        `/reports/2021-06-30/reports/${reportId}`,
        { skipSuccessLog: () => true },
      );
      if (report.processingStatus === 'CANCELLED') return '';
      if (report.processingStatus === 'FATAL') {
        throw new HttpException(
          `Amazon report ${reportType} failed`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (report.processingStatus === 'DONE' && report.reportDocumentId) {
        return this.downloadReport(report.reportDocumentId);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, REPORT_POLL_INTERVAL_MS),
      );
    }
    throw new HttpException(
      `Amazon report ${reportType} timed out`,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  private async downloadReport(reportDocumentId: string): Promise<string> {
    const document = await this.request<AmazonReportDocument>(
      'GET',
      `/reports/2021-06-30/documents/${reportDocumentId}`,
      { skipSuccessLog: () => true },
    );
    // Önceden imzalı adres: Amazon kimlik başlıkları gönderilmez.
    const { data } = await firstValueFrom(
      this.http.get<ArrayBuffer>(document.url, { responseType: 'arraybuffer' }),
    );
    const content = Buffer.from(data);
    return (
      document.compressionAlgorithm === 'GZIP' ? gunzipSync(content) : content
    ).toString('utf-8');
  }

  // Aynı anda gelen isteklerde tek token isteği atılır.
  private ensureAccessToken(): Promise<void> {
    if (Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return Promise.resolve();
    }
    this.tokenRequest ??= this.fetchAccessToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async fetchAccessToken(): Promise<void> {
    const clientId = this.configService.get<string>('AMAZON_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AMAZON_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('AMAZON_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      throw new HttpException(
        'Amazon credentials are not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ access_token: string; expires_in: number }>(
          AMAZON_TOKEN_URL,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    } catch (error) {
      // Ham hata isteğin gövdesini (secret) taşıyabilir; yalnızca mesaj atılır.
      throw new HttpException(
        `Amazon token request failed: ${
          error?.response?.data?.error_description || error?.message
        }`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
