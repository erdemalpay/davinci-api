import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { IkasService } from './ikas.service';
import { OrderService } from '../order/order.service';
import { MenuService } from '../menu/menu.service';
import { LocationService } from '../location/location.service';
import { AccountingService } from '../accounting/accounting.service';
import { UserService } from '../user/user.service';
import { NotificationService } from '../notification/notification.service';
import { VisitService } from '../visit/visit.service';
import { CreateOrderDto, OrderStatus, OrderCollectionStatus } from '../order/order.dto';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { NotificationEventType } from '../notification/notification.dto';
import { format } from 'date-fns';

interface SeenUsers {
  [key: string]: boolean;
}

export interface IkasOrderJobData {
  merchantId: string;
  data: {
    status: string;
    orderNumber?: string;
    salesChannelId?: string;
    stockLocationId?: string;
    customer?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    orderLineItems: Array<{
      id: string;
      quantity: number;
      finalPrice: number;
      stockLocationId: string;
      variant: {
        productId: string;
      };
    }>;
  };
}

@Processor('ikas-orders')
export class IkasOrderProcessor {
  private readonly logger = new Logger(IkasOrderProcessor.name);

  constructor(
    private readonly ikasService: IkasService,
    private readonly orderService: OrderService,
    private readonly menuService: MenuService,
    private readonly locationService: LocationService,
    private readonly accountingService: AccountingService,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly visitService: VisitService,
  ) {}

  @Process('create-order')
  async handleOrderCreation(job: Job<IkasOrderJobData>) {
    const startTime = Date.now();
    this.logger.log(`Processing job ${job.id} - Order ${job.data.data.orderNumber}`);

    try {
      const { data } = job.data;
      const orderLineItems = data?.orderLineItems ?? [];

      if (orderLineItems.length === 0) {
        this.logger.log('No order line items to process');
        return { success: true, processedCount: 0 };
      }

      if (data.status !== 'CREATED') {
        this.logger.log(`Skipping job as status is not 'CREATED': ${data.status}`);
        return { success: true, skipped: true };
      }

      const constantUser = await this.userService.findByIdWithoutPopulate('dv');
      if (!constantUser) {
        throw new Error('Constant user not found');
      }

      let processedCount = 0;
      const errors: string[] = [];

      // Process each order line item
      for (const orderLineItem of orderLineItems) {
        try {
          const { quantity, stockLocationId, id, finalPrice } = orderLineItem;
          const { productId } = orderLineItem.variant;

          if (!productId || !stockLocationId || !quantity) {
            this.logger.warn(`Invalid order line item data for item ${id}`);
            errors.push(`Invalid data for item ${id}`);
            continue;
          }

          const foundMenuItem = await this.menuService.findByIkasId(productId);
          if (!foundMenuItem?.matchedProduct) {
            this.logger.log(`Menu item not found for productId: ${productId}`);
            errors.push(`Menu item not found: ${productId}`);
            continue;
          }

          const foundLocation = await this.locationService.findByIkasId(stockLocationId);
          if (!foundLocation) {
            this.logger.log(`Location not found for stockLocationId: ${stockLocationId}`);
            errors.push(`Location not found: ${stockLocationId}`);
            continue;
          }

          const foundPaymentMethod = await this.accountingService.findPaymentMethodByIkasId(
            data.salesChannelId,
          );

          const foundIkasOrder = await this.orderService.findByIkasId(id);
          if (foundIkasOrder) {
            this.logger.log(`Order already exists for ikas order id: ${id}, skipping.`);
            continue;
          }

          const ikasOrderNumber = data.orderNumber;
          let createOrderObject: CreateOrderDto = {
            item: foundMenuItem._id,
            quantity: quantity,
            note: '',
            discount: undefined,
            discountNote: '',
            isOnlinePrice: false,
            location: 4,
            unitPrice: finalPrice,
            paidQuantity: quantity,
            deliveredAt: new Date(),
            deliveredBy: constantUser._id,
            preparedAt: new Date(),
            preparedBy: constantUser._id,
            status: OrderStatus.AUTOSERVED,
            stockLocation: foundLocation._id,
            createdAt: new Date(),
            tableDate: new Date(),
            createdBy: constantUser._id,
            stockNote: StockHistoryStatusEnum.IKASORDERCREATE,
            ikasId: id,
            ...(foundPaymentMethod && {
              paymentMethod: foundPaymentMethod._id,
            }),
            ...(ikasOrderNumber && {
              ikasOrderNumber: ikasOrderNumber,
            }),
          };

          if (data.stockLocationId) {
            const foundLocation = await this.locationService.findByIkasId(data.stockLocationId);
            if (foundLocation) {
              createOrderObject = {
                ...createOrderObject,
                ikasCustomer: {
                  id: data.customer?.id,
                  firstName: data.customer?.firstName,
                  lastName: data.customer?.lastName,
                  email: data.customer?.email,
                  phone: data.customer?.phone,
                  location: foundLocation._id,
                },
              };
            }
          }

          try {
            const order = await this.orderService.createOrder(constantUser, createOrderObject);
            this.logger.log(`Order created: ${order._id}`);

            // Handle notifications for pickup orders
            if (data.stockLocationId) {
              const foundLocation = await this.locationService.findByIkasId(data.stockLocationId);
              if (foundLocation) {
                const visits = await this.visitService.findByDateAndLocation(
                  format(order.createdAt, 'yyyy-MM-dd'),
                  2,
                );
                const uniqueVisitUsers =
                  visits
                    ?.reduce(
                      (acc: { unique: typeof visits; seenUsers: SeenUsers }, visit) => {
                        acc.seenUsers = acc.seenUsers || {};
                        if (visit?.user && !acc.seenUsers[(visit as any).user]) {
                          acc.seenUsers[(visit as any).user] = true;
                          acc.unique.push(visit);
                        }
                        return acc;
                      },
                      { unique: [], seenUsers: {} },
                    )
                    ?.unique?.map((visit) => visit.user) ?? [];

                const message = {
                  key: 'IkasPickupOrderArrived',
                  params: {
                    product: foundMenuItem.name,
                  },
                };

                const notificationEvents = await this.notificationService.findAllEventNotifications();
                const ikasTakeawayEvent = notificationEvents.find(
                  (notification) => notification.event === NotificationEventType.IKASTAKEAWAY,
                );

                if (ikasTakeawayEvent) {
                  await this.notificationService.createNotification({
                    type: ikasTakeawayEvent.type,
                    createdBy: ikasTakeawayEvent.createdBy,
                    selectedUsers: ikasTakeawayEvent.selectedUsers,
                    selectedRoles: ikasTakeawayEvent.selectedRoles,
                    selectedLocations: ikasTakeawayEvent.selectedLocations,
                    seenBy: [],
                    event: NotificationEventType.IKASTAKEAWAY,
                    message,
                  });
                }
              }
            }

            // Create collection
            const createdCollection = {
              location: 4,
              paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
              amount: finalPrice * quantity,
              status: OrderCollectionStatus.PAID,
              orders: [
                {
                  order: order._id,
                  paidQuantity: quantity,
                },
              ],
              createdBy: constantUser._id,
              tableDate: new Date(),
              ikasId: id,
              ...(ikasOrderNumber && {
                ikasOrderNumber: ikasOrderNumber,
              }),
            };

            try {
              const collection = await this.orderService.createCollection(constantUser, createdCollection);
              this.logger.log(`Collection created: ${collection._id}`);
            } catch (collectionError) {
              this.logger.error('Error creating collection:', collectionError.message);
              errors.push(`Collection error for ${id}: ${collectionError.message}`);
            }

            processedCount++;
          } catch (orderError) {
            this.logger.error('Error creating order:', orderError.message);
            errors.push(`Order error for ${id}: ${orderError.message}`);
          }
        } catch (itemError) {
          this.logger.error('Error processing order line item:', itemError.message);
          errors.push(`Item error: ${itemError.message}`);
        }
      }

      // Update Ikas stocks in bulk after all orders are processed
      this.logger.log('Triggering bulk stock update to Ikas...');
      try {
        await this.ikasService.bulkUpdateAllProductStocks();
        this.logger.log('Bulk stock update completed');
      } catch (stockError) {
        this.logger.error('Error updating Ikas stocks:', stockError.message);
        // Don't fail the job for stock update errors
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Job ${job.id} completed in ${duration}ms - Processed: ${processedCount}/${orderLineItems.length}, Errors: ${errors.length}`,
      );

      return {
        success: true,
        processedCount,
        totalItems: orderLineItems.length,
        errors: errors.length > 0 ? errors : undefined,
        duration,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error.message);
      throw error;
    }
  }
}
