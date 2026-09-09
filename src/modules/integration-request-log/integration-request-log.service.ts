import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IntegrationRequestLog,
  IntegrationRequestStatus,
  IntegrationSource,
} from './integration-request-log.schema';

@Injectable()
export class IntegrationRequestLogService {
  constructor(
    @InjectModel(IntegrationRequestLog.name)
    private readonly integrationRequestLogModel: Model<IntegrationRequestLog>,
  ) {}

  /** Cagiran taraf bunu kendi try/catch'inde cagirmali. */
  async create(data: {
    source: IntegrationSource;
    method: string;
    endpoint: string;
    requestBody?: any;
    responseBody?: any;
    status: IntegrationRequestStatus;
    statusCode?: number;
    errorMessage?: string;
    durationMs: number;
  }): Promise<void> {
    await this.integrationRequestLogModel.create(data);
  }

  async findAll(
    page = 1,
    limit = 50,
    filters?: {
      source?: IntegrationSource;
      method?: string;
      status?: IntegrationRequestStatus;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{
    logs: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query: any = {};

    if (filters?.source) {
      query.source = filters.source;
    }

    if (filters?.method) {
      query.method = filters.method;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.integrationRequestLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.integrationRequestLogModel.countDocuments(query),
    ]);

    return { logs, total, page, limit };
  }
}
