import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MenuItem } from '../menu/item.schema';
import { toPickupFulfillmentOrders } from '../shopify/shopify.pickup-plan';
import { ShopifyService } from '../shopify/shopify.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { AccountingService } from './../accounting/accounting.service';
import { Order } from './order.schema';
import {
  buildPreOrderShipmentInput,
  extractShipmentTracking,
  groupByShopifyOrderId,
  planPreOrderShipmentFulfillment,
  selectShippableOrders,
  ShipmentFulfilledPayload,
  ShipmentSkip,
} from './pre-order-shipment.plan';

export type PreOrderShipmentResult = {
  created: { shopifyOrderId: string; shipmentOrderNumber: string }[];
  skipped: ShipmentSkip[];
  failed: { shopifyOrderId: string; message: string }[];
};

export type ShipmentFulfilledResult = {
  closedFulfillmentOrders: number;
  markedShipped: number;
  failedOrders: string[];
  skippedReason?: 'NO_TRACKING';
};

/**
 * Ön sipariş gönderim kopyaları: Erdem'in Connector App ile elle açtığı 0 TL
 * siparişlerin panel karşılığı. order.service.ts zaten çok büyük olduğu için ayrı.
 */
@Injectable()
export class PreOrderShipmentService {
  private readonly logger = new Logger(PreOrderShipmentService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @Inject(forwardRef(() => ShopifyService))
    private readonly shopifyService: ShopifyService,
    private readonly websocketGateway: AppWebSocketGateway,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
  ) {}

  async create(orderIds: number[]): Promise<PreOrderShipmentResult> {
    const orders = await this.orderModel
      .find({ _id: { $in: orderIds } })
      .populate<{ item: MenuItem }>('item');

    const { groups, skipped } = selectShippableOrders(orders);
    const result: PreOrderShipmentResult = { created: [], skipped, failed: [] };

    // Sırayla: biri hata verirse diğerleri devam eder.
    for (const [shopifyOrderId, groupOrders] of groups) {
      try {
        const source = await this.shopifyService.getPreOrderShipmentSource(
          shopifyOrderId,
        );
        const input = buildPreOrderShipmentInput(
          source,
          groupOrders.map((order) => ({
            title: order.item?.name ?? '',
            quantity: order.quantity,
          })),
        );
        const shipment = await this.shopifyService.createPreOrderShipmentOrder(
          input,
        );

        await this.orderModel.updateMany(
          { _id: { $in: groupOrders.map((order) => order._id) } },
          {
            preOrderShipmentShopifyOrderId: shipment.id,
            preOrderShipmentShopifyOrderNumber: shipment.name,
          },
        );
        result.created.push({
          shopifyOrderId,
          shipmentOrderNumber: shipment.name,
        });
      } catch (error) {
        this.logger.error(
          `Pre-order shipment failed for Shopify order ${shopifyOrderId}:`,
          error,
        );
        result.failed.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (result.created.length > 0) {
      const updated = await this.orderModel.find({
        _id: { $in: orderIds },
        preOrderShipmentShopifyOrderId: { $exists: true },
      });
      this.websocketGateway.emitOrderUpdated(updated);
    }

    return result;
  }

  /**
   * orders/fulfilled webhook'undan çağrılır. Sipariş bir kopya değilse undefined
   * döner ve mevcut akış değişmez. Kopya etikete göre değil id'ye göre tanınır.
   */
  async handleShipmentFulfilled(
    data: ShipmentFulfilledPayload,
  ): Promise<ShipmentFulfilledResult | undefined> {
    const shipmentOrderId = data?.id?.toString();
    if (!shipmentOrderId) return undefined;

    const records = await this.orderModel.find({
      preOrderShipmentShopifyOrderId: shipmentOrderId,
    });
    if (records.length === 0) return undefined;

    const result: ShipmentFulfilledResult = {
      closedFulfillmentOrders: 0,
      markedShipped: 0,
      failedOrders: [],
    };

    const tracking = extractShipmentTracking(data);
    if (!tracking) {
      this.logger.warn(
        `Pre-order shipment ${shipmentOrderId} fulfilled without tracking number; originals left open.`,
      );
      return { ...result, skippedReason: 'NO_TRACKING' };
    }

    for (const [originalOrderId, group] of groupByShopifyOrderId(records)) {
      try {
        const fulfillmentOrders = toPickupFulfillmentOrders(
          await this.shopifyService.getFulfillmentOrdersForOrder(
            originalOrderId,
          ),
        );
        const plan = planPreOrderShipmentFulfillment(
          group.map((record) => ({
            shopifyOrderLineItemId: String(record.shopifyOrderLineItemId),
            quantity: record.quantity,
          })),
          fulfillmentOrders,
        );

        const handledIds = new Set<number>();
        for (const input of plan) {
          const fulfillmentId =
            await this.shopifyService.createFulfillmentWithTracking(
              input,
              tracking,
            );
          result.closedFulfillmentOrders++;
          const ids = group
            .filter((record) =>
              input.lineItemIds.includes(String(record.shopifyOrderLineItemId)),
            )
            .map((record) => record._id);
          ids.forEach((id) => handledIds.add(id));
          await this.orderModel.updateMany(
            { _id: { $in: ids } },
            { isShipped: true, shopifyFulfillmentId: fulfillmentId },
          );
        }

        // Orijinalde zaten kapalı satırlar (26 Kasım'daki 57 sipariş gibi): yalnızca panel.
        const alreadyClosedIds = group
          .map((record) => record._id)
          .filter((id) => !handledIds.has(id));
        if (alreadyClosedIds.length > 0) {
          await this.orderModel.updateMany(
            { _id: { $in: alreadyClosedIds } },
            { isShipped: true },
          );
        }
        result.markedShipped += group.length;
      } catch (error) {
        this.logger.error(
          `Failed to close original order ${originalOrderId} for pre-order shipment ${shipmentOrderId}:`,
          error,
        );
        result.failedOrders.push(originalOrderId);
      }
    }

    if (result.markedShipped > 0) {
      const updated = await this.orderModel.find({
        preOrderShipmentShopifyOrderId: shipmentOrderId,
      });
      this.websocketGateway.emitOrderUpdated(updated);
      this.accountingService.invalidateReservedStocks();
    }

    return result;
  }
}
