import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';
import {
  IntegrationRequestStatus,
  IntegrationSource,
} from '../integration-request-log/integration-request-log.schema';
import { IntegrationRequestLogService } from '../integration-request-log/integration-request-log.service';
import { N11_REST_BASE_URL, N11_SOAP_BASE_URL } from './n11.dto';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

@Injectable()
export class N11Client {
  private readonly logger = new Logger(N11Client.name);
  private readonly appKey: string;
  private readonly appSecret: string;
  readonly integrator = 'davinci';

  private static readonly MAX_LOGGED_BODY_BYTES = 100 * 1024;
  private readonly xmlParser = new XMLParser({
    removeNSPrefix: true,
    // Değerler string kalsın: sipariş numaraları sayıya çevrilip bozulmasın.
    parseTagValue: false,
  });

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly integrationRequestLogService: IntegrationRequestLogService,
  ) {
    this.appKey = this.configService.get<string>('N11_APP_KEY') || '';
    this.appSecret = this.configService.get<string>('N11_APP_SECRET') || '';
  }

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  // n11'in sandbox'ı yok: staging/lokal kendi stoğuyla canlı mağazayı ezmesin.
  get writesEnabled(): boolean {
    return (
      this.isProduction ||
      this.configService.get<string>('N11_ALLOW_WRITES') === 'true'
    );
  }

  assertWritesEnabled(): void {
    if (!this.writesEnabled) {
      throw new HttpException(
        'n11 writes are disabled outside production (set N11_ALLOW_WRITES=true to test locally)',
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
          url: `${N11_REST_BASE_URL}${path}`,
          ...(body !== undefined && { data: body }),
          ...(params && { params }),
          headers: {
            appkey: this.appKey,
            appsecret: this.appSecret,
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

  async soapRequest(
    service: string,
    operation: string,
    innerXml: string,
  ): Promise<any> {
    const envelope =
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">' +
      '<soapenv:Header/><soapenv:Body>' +
      `<sch:${operation}Request>` +
      `<auth><appKey>${escapeXml(this.appKey)}</appKey><appSecret>${escapeXml(
        this.appSecret,
      )}</appSecret></auth>` +
      innerXml +
      `</sch:${operation}Request>` +
      '</soapenv:Body></soapenv:Envelope>';
    const endpoint = `/ws/${service}#${operation}`;
    const loggedRequest = this.maskSoapAuth(envelope);
    const startedAt = Date.now();

    try {
      const { data, status } = await firstValueFrom(
        this.http.request<string>({
          method: 'POST',
          url: `${N11_SOAP_BASE_URL}/${service}`,
          data: envelope,
          responseType: 'text',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: '',
          },
        }),
      );

      const parsed = this.xmlParser.parse(data);
      const response = parsed?.Envelope?.Body?.[`${operation}Response`];
      if (response?.result?.status !== 'success') {
        throw new Error(
          `n11 ${operation} failed: ${
            response?.result?.errorMessage ||
            response?.result?.errorCode ||
            'unknown error'
          }`,
        );
      }

      await this.logRequest({
        method: 'POST',
        endpoint,
        requestBody: loggedRequest,
        responseBody: response,
        status: IntegrationRequestStatus.SUCCESS,
        statusCode: status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      await this.logRequest({
        method: 'POST',
        endpoint,
        requestBody: loggedRequest,
        responseBody: error?.response?.data,
        status: IntegrationRequestStatus.ERROR,
        statusCode: error?.response?.status,
        errorMessage: this.buildErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private maskSoapAuth(xml: string): string {
    return xml
      .replace(/<appKey>[^<]*<\/appKey>/, '<appKey>***</appKey>')
      .replace(/<appSecret>[^<]*<\/appSecret>/, '<appSecret>***</appSecret>');
  }

  // errorMessage şemada String; object yazılırsa log kaydı kaybolur.
  private buildErrorMessage(error: any): string {
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
    if (bytes <= N11Client.MAX_LOGGED_BODY_BYTES) return value;
    return {
      __truncated: true,
      originalBytes: bytes,
      preview: serialized.slice(0, 2000),
    };
  }

  private async logRequest(entry: {
    method: string;
    endpoint: string;
    requestBody?: any;
    responseBody?: any;
    status: IntegrationRequestStatus;
    statusCode?: number;
    errorMessage?: string;
    durationMs: number;
  }): Promise<void> {
    try {
      await this.integrationRequestLogService.create({
        source: IntegrationSource.N11,
        ...entry,
        requestBody: this.truncate(entry.requestBody),
        responseBody: this.truncate(entry.responseBody),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write n11 request log for ${entry.method} ${
          entry.endpoint
        }: ${error?.message || error}`,
      );
    }
  }
}
