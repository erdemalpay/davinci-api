import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationSource } from '../integration-request-log/integration-request-log.schema';
import { IntegrationRequestLogService } from '../integration-request-log/integration-request-log.service';
import { LoggedHttpClient } from '../integration-request-log/logged-http.client';
import { IDEFIX_BASE_URL } from './idefix.dto';

// Test ortamı IP izni istediği için kullanılmıyor; istekler canlıya gider.
@Injectable()
export class IdefixClient extends LoggedHttpClient {
  protected readonly source = IntegrationSource.IDEFIX;
  protected readonly baseUrl = IDEFIX_BASE_URL;
  protected readonly allowWritesKey = 'IDEFIX_ALLOW_WRITES';
  private readonly vendorToken: string;

  constructor(
    configService: ConfigService,
    http: HttpService,
    integrationRequestLogService: IntegrationRequestLogService,
  ) {
    super(configService, http, integrationRequestLogService);
    const apiKey = this.configService.get<string>('IDEFIX_TOKEN') || '';
    const apiSecret = this.configService.get<string>('IDEFIX_SECRET') || '';
    this.vendorToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  }

  protected authHeaders() {
    return { 'X-API-KEY': this.vendorToken };
  }
}
