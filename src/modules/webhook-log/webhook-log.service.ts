import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
	WebhookLog,
	WebhookSource,
	WebhookStatus
} from './webhook-log.schema';

@Injectable()
export class WebhookLogService {
  private readonly logger = new Logger(WebhookLogService.name);

  constructor(
    @InjectModel(WebhookLog.name)
    private webhookLogModel: Model<WebhookLog>,
  ) {}

  /**
   * Logs webhook request
   * All requests are logged
   */
  async logWebhookRequest(
    source: WebhookSource,
    endpoint: string,
    requestBody: any,
  ): Promise<WebhookLog> {
    // Create new log entry (each request is saved separately)
    const webhookLog = new this.webhookLogModel({
      source,
      endpoint,
      requestBody,
      status: WebhookStatus.PENDING,
    });

    return await webhookLog.save();
  }

  /**
   * Updates webhook response
   */
  async updateWebhookResponse(
    logId: number,
    responseBody: any,
    statusCode: number,
    status: WebhookStatus = WebhookStatus.SUCCESS,
    errorMessage?: string,
    orderIds?: number[],
    externalOrderId?: string,
    startTime?: number,
  ): Promise<WebhookLog> {
    const updateData: any = {
      responseBody,
      statusCode,
      status,
      processedAt: new Date(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    if (orderIds && orderIds.length > 0) {
      updateData.orderIds = orderIds;
    }

    if (externalOrderId) {
      updateData.externalOrderId = externalOrderId;
    }

    if (startTime) {
      updateData.processingTimeMs = Date.now() - startTime;
    }

    return await this.webhookLogModel.findByIdAndUpdate(logId, updateData, {
      new: true,
    });
  }


  /**
   * Finds log by ID
   */
  async findById(id: number): Promise<WebhookLog | null> {
    return await this.webhookLogModel.findById(id);
  }

  /**
   * Lists all logs (with pagination)
   */
  async findAll(
    page: number = 1,
    limit: number = 50,
    filters?: {
      source?: WebhookSource;
      status?: WebhookStatus;
      endpoint?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ logs: any[]; total: number; page: number; limit: number }> {
    const query: any = {};

    if (filters?.source) {
      query.source = filters.source;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.endpoint) {
      query.endpoint = filters.endpoint;
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
      this.webhookLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.webhookLogModel.countDocuments(query),
    ]);

    return {
      logs,
      total,
      page,
      limit,
    };
  }

}
