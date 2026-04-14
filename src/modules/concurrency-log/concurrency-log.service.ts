import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConcurrencyLog } from './concurrency-log.schema';

@Injectable()
export class ConcurrencyLogService {
  constructor(
    @InjectModel(ConcurrencyLog.name)
    private readonly concurrencyLogModel: Model<ConcurrencyLog>,
  ) {}

  async create(data: {
    method: string;
    endpoint: string;
    inFlightCount: number;
    userId?: string;
    userName?: string;
  }): Promise<void> {
    await this.concurrencyLogModel.create(data);
  }

  async findAll(
    page: number = 1,
    limit: number = 50,
    filters?: {
      endpoint?: string;
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

    if (filters?.endpoint) {
      query.endpoint = { $regex: filters.endpoint, $options: 'i' };
    }

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.concurrencyLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.concurrencyLogModel.countDocuments(query),
    ]);

    return { logs, total, page, limit };
  }
}
