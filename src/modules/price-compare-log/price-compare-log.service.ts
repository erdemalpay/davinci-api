import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PriceCompareLog,
  PriceCompareLogStatus,
  PriceCompareLogType,
} from './price-compare-log.schema';

@Injectable()
export class PriceCompareLogService {
  private readonly logger = new Logger(PriceCompareLogService.name);

  constructor(
    @InjectModel(PriceCompareLog.name)
    private readonly priceCompareLogModel: Model<PriceCompareLog>,
  ) {}

  async createLog(
    type: PriceCompareLogType,
    target: string,
    metadata?: any,
  ): Promise<PriceCompareLog> {
    const priceCompareLog = new this.priceCompareLogModel({
      type,
      target,
      metadata,
      status: PriceCompareLogStatus.PENDING,
    });

    return await priceCompareLog.save();
  }

  async updateLog(
    logId: number,
    responseBody: any,
    status: PriceCompareLogStatus = PriceCompareLogStatus.SUCCESS,
    errorMessage?: string,
    totalItems?: number,
    processingStartTime?: number,
  ): Promise<PriceCompareLog> {
    const updateData: any = {
      responseBody,
      status,
      processedAt: new Date(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (typeof totalItems === 'number') {
      updateData.totalItems = totalItems;
    }

    if (processingStartTime) {
      updateData.processingTimeMs = Date.now() - processingStartTime;
    }

    try {
      const updated = await this.priceCompareLogModel.findByIdAndUpdate(
        logId,
        updateData,
        { new: true },
      );

      if (!updated) {
        this.logger.warn(`Price compare log ${logId} not found for update`);
        throw new Error(`Price compare log ${logId} not found`);
      }

      return updated;
    } catch (error) {
      this.logger.error(`Failed to update price compare log ${logId}:`, error);
      throw error;
    }
  }

  async findById(id: number): Promise<PriceCompareLog | null> {
    return await this.priceCompareLogModel.findById(id);
  }

  async findAll(
    page: number = 1,
    limit: number = 50,
    filters?: {
      type?: PriceCompareLogType;
      status?: PriceCompareLogStatus;
      target?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ logs: any[]; total: number; page: number; limit: number }> {
    const query: any = {};

    if (filters?.type) {
      query.type = filters.type;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.target) {
      query.target = filters.target;
    }

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.priceCompareLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.priceCompareLogModel.countDocuments(query),
    ]);

    return {
      logs,
      total,
      page,
      limit,
    };
  }
}
