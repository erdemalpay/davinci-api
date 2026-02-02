import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  GetTrendyolOrdersQueryDto,
  TrendyolOrderDto,
  TrendyolOrderLineDto,
  TrendyolOrdersResponseDto,
} from './trendyol.dto';

@Injectable()
export class TrendyolService {
  private readonly logger = new Logger(TrendyolService.name);
  private readonly baseUrl = process.env.TRENDYOL_BASE_URL!;
  private readonly sellerId = process.env.TRENDYOL_SELLER_ID!;
  private readonly apiKey = process.env.TRENDYOL_PRODUCTION_API_KEY!;
  private readonly apiSecret = process.env.TRENDYOL_PRODUCTION_API_SECRET!;

  private get userAgent() {
    return `${this.sellerId} - ${process.env.TRENDYOL_USER_AGENT_SUFFIX}`;
  }

  constructor(private readonly http: HttpService) {}

  /**
   * Trendyol siparişlerini çeker ve sadeleştirilmiş formatta döner
   */
  async getAllOrders(
    params: GetTrendyolOrdersQueryDto,
  ): Promise<TrendyolOrdersResponseDto> {
    const {
      page = 0,
      size = 50,
      startDate,
      endDate,
      status,
      orderNumber,
      orderByField,
      orderByDirection,
    } = params;

    try {
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/integration/order/sellers/${this.sellerId}/orders`,
          {
            params: {
              page,
              size,
              ...(startDate && { startDate }),
              ...(endDate && { endDate }),
              ...(status && { status }),
              ...(orderNumber && { orderNumber }),
              ...(orderByField && { orderByField }),
              ...(orderByDirection && { orderByDirection }),
            },
            auth: {
              username: this.apiKey,
              password: this.apiSecret,
            },
            headers: {
              'User-Agent': this.userAgent,
              Accept: 'application/json',
            },
          },
        ),
      );

      // Sadeleştirilmiş response
      return {
        totalElements: data.totalElements,
        totalPages: data.totalPages,
        page: data.page,
        size: data.size,
        content: data.content.map((order: any) => this.mapOrder(order)),
      };
    } catch (error) {
      this.logger.error('Error fetching Trendyol orders', error);
      throw error;
    }
  }

  /**
   * Trendyol raw order'ı sadeleştirilmiş formata dönüştürür
   */
  private mapOrder(order: any): TrendyolOrderDto {
    return {
      id: order.id || order.shipmentPackageId,
      orderNumber: order.orderNumber,
      email: order.customerEmail,
      createdAt: new Date(order.orderDate),
      updatedAt: new Date(order.lastModifiedDate),
      totalPrice: order.grossAmount,
      currencyCode: order.currencyCode,
      status: order.shipmentPackageStatus || order.status,
      lines: order.lines?.map((line: any) => this.mapOrderLine(line)) || [],
    };
  }

  /**
   * Trendyol raw line item'ı sadeleştirilmiş formata dönüştürür
   */
  private mapOrderLine(line: any): TrendyolOrderLineDto {
    return {
      id: line.lineId || line.id,
      title: line.productName,
      quantity: line.quantity,
      price: line.amount,
      productId: line.productCode || line.contentId,
      sku: line.merchantSku,
      barcode: line.barcode,
    };
  }
}
