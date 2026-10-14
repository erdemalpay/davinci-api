import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';
import {
  IntegrationRequestStatus,
  IntegrationSource,
} from '../integration-request-log/integration-request-log.schema';
import { IntegrationRequestLogService } from '../integration-request-log/integration-request-log.service';
import { LoggedHttpClient } from '../integration-request-log/logged-http.client';
import { N11_REST_BASE_URL, N11_SOAP_BASE_URL } from './n11.dto';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

@Injectable()
export class N11Client extends LoggedHttpClient {
  protected readonly source = IntegrationSource.N11;
  protected readonly baseUrl = N11_REST_BASE_URL;
  protected readonly allowWritesKey = 'N11_ALLOW_WRITES';
  private readonly appKey: string;
  private readonly appSecret: string;
  readonly integrator = 'davinci';

  private readonly xmlParser = new XMLParser({
    removeNSPrefix: true,
    // Değerler string kalsın: sipariş numaraları sayıya çevrilip bozulmasın.
    parseTagValue: false,
  });

  constructor(
    configService: ConfigService,
    http: HttpService,
    integrationRequestLogService: IntegrationRequestLogService,
  ) {
    super(configService, http, integrationRequestLogService);
    this.appKey = this.configService.get<string>('N11_APP_KEY') || '';
    this.appSecret = this.configService.get<string>('N11_APP_SECRET') || '';
  }

  protected authHeaders() {
    return { appkey: this.appKey, appsecret: this.appSecret };
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
}
