import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { LocationService } from '../location/location.service';
import { MenuService } from '../menu/menu.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { CreateOrderDto, OrderStatus } from '../order/order.dto';
import { OrderService } from '../order/order.service';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { StockHistoryStatusEnum } from './../accounting/accounting.dto';
import { AccountingService } from './../accounting/accounting.service';
import { OrderCollectionStatus } from './../order/order.dto';
import {
  CreateTrendyolWebhookDto,
  GetTrendyolOrdersQueryDto,
  GetTrendyolProductsQueryDto,
  TrendyolOrderDto,
  TrendyolOrderLineDto,
  TrendyolOrdersResponseDto,
  TrendyolProductDto,
  TrendyolProductsResponseDto,
} from './trendyol.dto';

@Injectable()
export class TrendyolService {
  private readonly logger = new Logger(TrendyolService.name);
  private readonly baseUrl = process.env.TRENDYOL_BASE_URL!;
  private readonly sellerId = process.env.TRENDYOL_SELLER_ID!;
  private readonly apiKey = process.env.TRENDYOL_PRODUCTION_API_KEY!;
  private readonly apiSecret = process.env.TRENDYOL_PRODUCTION_API_SECRET!;
  private readonly OnlineStoreLocation = 6;

  private get userAgent() {
    return `${this.sellerId} - ${process.env.TRENDYOL_USER_AGENT_SUFFIX}`;
  }

  constructor(
    private readonly http: HttpService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    private readonly userService: UserService,
    private readonly locationService: LocationService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Trendyol'a webhook kaydı oluşturur
   */
  async createWebhook(webhookData: CreateTrendyolWebhookDto) {
    try {
      this.logger.log(
        'Creating webhook with data:',
        JSON.stringify(webhookData, null, 2),
      );
      this.logger.log(
        'Target URL:',
        `${this.baseUrl}/integration/webhook/sellers/${this.sellerId}/webhooks`,
      );

      const { data } = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/integration/webhook/sellers/${this.sellerId}/webhooks`,
          webhookData,
          {
            auth: {
              username: this.apiKey,
              password: this.apiSecret,
            },
            headers: {
              'User-Agent': this.userAgent,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        ),
      );

      this.logger.log('Webhook created successfully:', data);
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('Error creating Trendyol webhook', error);
      this.logger.error('Error response data:', error?.response?.data);
      this.logger.error('Error response status:', error?.response?.status);
      this.logger.error('Error response headers:', error?.response?.headers);

      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        JSON.stringify(error?.response?.data) ||
        error?.message ||
        'Unknown error';

      throw new HttpException(
        `Failed to create webhook: ${errorMessage}`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trendyol'da kayıtlı webhook'ları listeler
   */
  async getWebhooks() {
    try {
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/integration/webhook/sellers/${this.sellerId}/webhooks`,
          {
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

      this.logger.log(`Found ${data?.length || 0} webhooks`);
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('Error fetching Trendyol webhooks', error);
      this.logger.error('Error response data:', error?.response?.data);

      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        JSON.stringify(error?.response?.data) ||
        error?.message ||
        'Unknown error';

      throw new HttpException(
        `Failed to fetch webhooks: ${errorMessage}`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trendyol'da kayıtlı webhook'u siler
   */
  async deleteWebhook(webhookId: string) {
    try {
      this.logger.log(`Deleting webhook with ID: ${webhookId}`);

      const { data } = await firstValueFrom(
        this.http.delete(
          `${this.baseUrl}/integration/webhook/sellers/${this.sellerId}/webhooks/${webhookId}`,
          {
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

      this.logger.log(`Webhook deleted successfully: ${webhookId}`);
      return {
        success: true,
        message: 'Webhook deleted successfully',
        data,
      };
    } catch (error) {
      this.logger.error('Error deleting Trendyol webhook', error);
      this.logger.error('Error response data:', error?.response?.data);

      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        JSON.stringify(error?.response?.data) ||
        error?.message ||
        'Unknown error';

      throw new HttpException(
        `Failed to delete webhook: ${errorMessage}`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trendyol ürünlerini çeker
   */
  async getAllProducts(
    params: GetTrendyolProductsQueryDto,
  ): Promise<TrendyolProductsResponseDto> {
    const {
      page = 0,
      size = 50,
      approved,
      barcode,
      startDate,
      endDate,
      archived,
      onsale,
    } = params;

    try {
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/integration/product/sellers/${this.sellerId}/products`,
          {
            params: {
              page,
              size,
              ...(approved && { approved }),
              ...(barcode && { barcode }),
              ...(startDate && { startDate }),
              ...(endDate && { endDate }),
              ...(archived && { archived }),
              ...(onsale && { onsale }),
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

      return {
        totalElements: data.totalElements,
        totalPages: data.totalPages,
        page: data.page,
        size: data.size,
        content: data.content,
      };
    } catch (error) {
      this.logger.error('Error fetching Trendyol products', error);
      throw new HttpException(
        `Failed to fetch products: ${
          error?.response?.data?.message || error?.message || 'Unknown error'
        }`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Tüm Trendyol ürünlerini çeker (tüm sayfaları otomatik olarak getirir)
   */
  async getAllProductsComplete(
    params: Omit<GetTrendyolProductsQueryDto, 'page' | 'size'> = {},
  ): Promise<TrendyolProductDto[]> {
    const allProducts: TrendyolProductDto[] = [];
    let currentPage = 0;
    let totalPages = 1;
    const pageSize = 200; // Maksimum sayfa boyutu

    try {
      this.logger.log('Starting to fetch all Trendyol products...');

      while (currentPage < totalPages) {
        const response = await this.getAllProducts({
          ...params,
          page: currentPage,
          size: pageSize,
        });

        allProducts.push(...response.content);
        totalPages = response.totalPages;
        currentPage++;

        this.logger.log(
          `Fetched page ${currentPage}/${totalPages} - Total products so far: ${allProducts.length}/${response.totalElements}`,
        );
      }

      this.logger.log(`Completed fetching all ${allProducts.length} products`);
      return allProducts;
    } catch (error) {
      this.logger.error('Error fetching all Trendyol products', error);
      throw error;
    }
  }

  /**
   * Trendyol ürünlerinin fiyat ve stok bilgilerini günceller
   * items parametresi verilirse sadece o ürünleri günceller
   * items parametresi verilmezse tüm ürünleri otomatik günceller
   */
  async updatePriceAndInventory(
    items?: Array<{
      barcode: string;
      quantity: number;
      salePrice: number;
      listPrice: number;
    }>,
  ) {
    try {
      let updateItems: Array<{
        barcode: string;
        quantity: number;
        salePrice: number;
        listPrice: number;
      }> = [];

      // Eğer items verilmişse direkt kullan
      if (items && items.length > 0) {
        if (items.length > 1000) {
          throw new HttpException(
            'Maximum 1000 items can be updated at once',
            HttpStatus.BAD_REQUEST,
          );
        }
        updateItems = items;
        this.logger.log(`Updating ${items.length} specific items`);
      } else {
        // Items verilmemişse tüm ürünleri otomatik güncelle
        this.logger.log(
          'No items provided, updating all products automatically',
        );

        const trendyolProducts = await this.getAllProductsComplete();
        const trendyolMenuItems = await this.menuService.getAllTrendyolItems();
        console.log(trendyolMenuItems);

        for (const menuItem of trendyolMenuItems) {
          try {
            const productStocks =
              await this.accountingService.findProductStockByLocation(
                menuItem.matchedProduct,
                this.OnlineStoreLocation,
              );
            console.log(productStocks);
            const trendyolProduct = trendyolProducts.find(
              (p) => p.productMainId === menuItem.trendyolSku,
            );

            if (!trendyolProduct) {
              this.logger.warn(
                `Trendyol product not found for SKU: ${menuItem.trendyolSku}`,
              );
              continue;
            }

            const totalQuantity = productStocks.reduce(
              (sum, stock) => sum + (stock.quantity || 0),
              0,
            );
            console.log(totalQuantity);
            const quantity = Math.min(totalQuantity, 20000);
            console.log(quantity);
            console.log(trendyolProduct);
            console.log(trendyolProduct.quantity);
            const salePrice = menuItem.onlinePrice || trendyolProduct.salePrice;
            const listPrice = menuItem.onlinePrice || trendyolProduct.listPrice;

            if (
              quantity !== trendyolProduct.quantity ||
              salePrice !== trendyolProduct.salePrice ||
              listPrice !== trendyolProduct.listPrice
            ) {
              updateItems.push({
                barcode: trendyolProduct.barcode,
                quantity,
                salePrice,
                listPrice,
              });
            }
          } catch (error) {
            this.logger.error(
              `Error processing menu item ${menuItem._id}:`,
              error,
            );
          }
        }
      }

      if (updateItems.length === 0) {
        this.logger.log('No products need updating');
        return {
          success: true,
          message: 'No products need updating',
          updated: 0,
        };
      }

      this.logger.log(`Updating ${updateItems.length} products`);

      // Trendyol 1000 item limiti olduğu için batch'lere böl
      const batches: (typeof updateItems)[] = [];
      for (let i = 0; i < updateItems.length; i += 1000) {
        batches.push(updateItems.slice(i, i + 1000));
      }

      const batchResults = [];
      for (const [index, batch] of batches.entries()) {
        this.logger.log(
          `Processing batch ${index + 1}/${batches.length} with ${
            batch.length
          } items`,
        );

        const { data } = await firstValueFrom(
          this.http.post(
            `${this.baseUrl}/integration/inventory/sellers/${this.sellerId}/products/price-and-inventory`,
            { items: batch },
            {
              auth: {
                username: this.apiKey,
                password: this.apiSecret,
              },
              headers: {
                'User-Agent': this.userAgent,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
            },
          ),
        );

        this.logger.log(
          `Batch ${index + 1} update initiated. Batch ID: ${
            data.batchRequestId
          }`,
        );
        batchResults.push(data);
      }

      return {
        success: true,
        message: `Updated ${updateItems.length} products in ${batches.length} batch(es)`,
        updated: updateItems.length,
        batchIds: batchResults.map((r) => r.batchRequestId),
      };
    } catch (error) {
      this.logger.error('Error updating price and inventory', error);
      this.logger.error('Error response data:', error?.response?.data);

      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        JSON.stringify(error?.response?.data) ||
        error?.message ||
        'Unknown error';

      throw new HttpException(
        `Failed to update price and inventory: ${errorMessage}`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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

  /**
   * Trendyol webhook'tan gelen yeni sipariş bildirimini işler
   */
  async orderCreateWebhook(data?: any) {
    this.logger.log('Processing Trendyol order create webhook...');
    this.logger.debug('Webhook data:', JSON.stringify(data, null, 2));

    try {
      // If no data is provided, return success (webhook verification)
      if (!data || Object.keys(data).length === 0) {
        this.logger.log('Webhook verification request - no data provided');
        return {
          success: true,
          message: 'Webhook endpoint is accessible',
        };
      }

      const lineItems = data?.lines ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv');

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (lineItems.length === 0) {
        this.logger.log('No line items to process');
        return { success: true, message: 'No line items to process' };
      }

      // Sadece CREATED statüsündeki siparişleri işle
      const packageStatus = data?.shipmentPackageStatus || data?.status;
      if (packageStatus !== 'Created') {
        this.logger.log(
          `Skipping order as status is not 'Created': ${packageStatus}`,
        );
        return {
          success: true,
          message: `Skipped - status: ${packageStatus}`,
        };
      }

      const createdOrders: Array<{
        order: number;
        paidQuantity: number;
        amount: number;
        menuItemName?: string;
      }> = [];
      let totalAmount = 0;

      for (const lineItem of lineItems) {
        try {
          const {
            id: lineItemId,
            lineId,
            quantity,
            productCode,
            contentId,
            amount,
            merchantSku,
          } = lineItem;

          const finalLineItemId = (lineItemId || lineId)?.toString();
          const finalProductId = (productCode || contentId)?.toString();

          if (!finalProductId || !quantity) {
            this.logger.warn(
              'Invalid line item data - missing productCode or quantity',
            );
            continue;
          }

          // Check if order already exists by trendyolLineItemId
          const existingOrder =
            await this.orderService.findByTrendyolLineItemId(finalLineItemId);
          if (existingOrder) {
            this.logger.log(
              `Order already exists for Trendyol line item id: ${finalLineItemId}, skipping`,
            );
            continue;
          }

          // Find menu item by SKU (merchantSku)
          const foundMenuItem = await this.menuService.findByTrendyolSku(
            merchantSku,
          );
          if (!foundMenuItem?.matchedProduct) {
            this.logger.log(
              `Menu item not found for merchantSku: ${merchantSku}`,
            );
            continue;
          }

          // Default location and stock location for Trendyol orders
          const locationId = 4;
          const stockLocationId = 6;

          const trendyolOrderNumber = data?.orderNumber;
          const shipmentPackageId = data?.shipmentPackageId || data?.id;

          const createOrderObject: CreateOrderDto = {
            item: foundMenuItem._id,
            quantity: quantity,
            note: '',
            discount: undefined,
            discountNote: '',
            isOnlinePrice: false,
            location: locationId,
            unitPrice: parseFloat(amount),
            paidQuantity: quantity,
            status: OrderStatus.AUTOSERVED,
            stockLocation: stockLocationId,
            createdAt: new Date(data?.orderDate || new Date()),
            tableDate: new Date(),
            createdBy: constantUser?._id,
            stockNote: StockHistoryStatusEnum.TRENDYOLORDERCREATE,
            trendyolOrderId: data?.id?.toString(),
            trendyolShipmentPackageId: shipmentPackageId?.toString(),
            trendyolLineItemId: finalLineItemId,
            paymentMethod: 'trendyol',
            ...(trendyolOrderNumber && {
              trendyolOrderNumber: trendyolOrderNumber.toString(),
            }),
          };

          // Customer bilgileri varsa ekle
          if (data?.customerFirstName || data?.customerEmail) {
            createOrderObject.trendyolCustomer = {
              id: data?.customerId?.toString() || 'unknown',
              firstName: data?.customerFirstName,
              lastName: data?.customerLastName,
              email: data?.customerEmail,
              phone: data?.shipmentAddress?.phone || '',
              location: locationId,
            };
          }

          try {
            const order = await this.orderService.createOrder(
              constantUser,
              createOrderObject,
            );
            this.logger.log('Order created:', order._id);

            const itemAmount = parseFloat(amount) * quantity;
            createdOrders.push({
              order: order._id,
              paidQuantity: quantity,
              amount: itemAmount,
              menuItemName: foundMenuItem.name,
            });
            totalAmount += itemAmount;
          } catch (orderError) {
            this.logger.error('Error creating order', orderError);
          }
        } catch (itemError) {
          this.logger.error('Error processing line item', itemError);
        }
      }

      // Create a single collection for all orders from this Trendyol package
      if (createdOrders.length > 0) {
        const trendyolOrderNumber = data?.orderNumber;
        const shipmentPackageId = data?.shipmentPackageId || data?.id;

        const createdCollection = {
          location: 4,
          paymentMethod: 'trendyol',
          amount: totalAmount,
          status: OrderCollectionStatus.PAID,
          orders: createdOrders.map(({ order, paidQuantity }) => ({
            order,
            paidQuantity,
          })),
          createdBy: constantUser._id,
          tableDate: new Date(),
          trendyolShipmentPackageId: shipmentPackageId?.toString(),
          ...(trendyolOrderNumber && {
            trendyolOrderNumber: trendyolOrderNumber.toString(),
          }),
        };

        try {
          const collection = await this.orderService.createCollection(
            constantUser,
            createdCollection,
          );
          this.logger.log('Collection created:', collection._id);

          // Notification için event kontrolü
          const notificationEvents =
            await this.notificationService.findAllEventNotifications();

          const trendyolOrderEvent = notificationEvents.find(
            (notification) =>
              notification.event === NotificationEventType.TRENDYOLORDER,
          );

          if (trendyolOrderEvent) {
            const orderNumber = trendyolOrderNumber || 'N/A';
            const productNames = createdOrders.map(
              ({ menuItemName }) => menuItemName || 'Bilinmeyen Ürün',
            );

            const message = {
              key: 'TrendyolOrderReceived',
              params: {
                orderNumber: orderNumber.toString(),
                amount: totalAmount.toFixed(2),
                itemCount: createdOrders.length,
                products: productNames.join(', '),
              },
            };

            await this.notificationService.createNotification({
              type: trendyolOrderEvent.type,
              createdBy: trendyolOrderEvent.createdBy,
              selectedUsers: trendyolOrderEvent.selectedUsers,
              selectedRoles: trendyolOrderEvent.selectedRoles,
              selectedLocations: trendyolOrderEvent.selectedLocations,
              seenBy: [],
              event: NotificationEventType.TRENDYOLORDER,
              message,
            });
          }

          return {
            success: true,
            message: 'Orders processed successfully',
            ordersCreated: createdOrders.length,
          };
        } catch (collectionError) {
          this.logger.error('Error creating collection', collectionError);
          throw collectionError;
        }
      }

      return {
        success: true,
        message: 'No valid orders to create',
      };
    } catch (error) {
      this.logger.error('Error in orderCreateWebhook', error);
      throw new HttpException(
        `Error processing webhook: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trendyol webhook'tan gelen sipariş statü değişikliklerini işler
   * (Cancelled, Shipped, Delivered, vb.)
   */
  async orderStatusWebhook(data?: any) {
    this.logger.log('Processing Trendyol order status webhook...');
    this.logger.debug('Webhook data:', JSON.stringify(data, null, 2));

    try {
      if (!data) {
        throw new HttpException(
          'Invalid request: Missing data',
          HttpStatus.BAD_REQUEST,
        );
      }

      const packageStatus = data?.shipmentPackageStatus || data?.status;
      const shipmentPackageId = data?.shipmentPackageId || data?.id;

      this.logger.log(
        `Trendyol order status changed to: ${packageStatus} for package: ${shipmentPackageId}`,
      );

      // TODO: Implement status change handling based on packageStatus
      // For now, just log and return success
      // Status types: Cancelled, Shipped, Delivered, Returned, etc.

      switch (packageStatus) {
        case 'Cancelled':
          // TODO: Handle cancellation
          this.logger.log('Order cancellation detected - to be implemented');
          break;
        case 'Shipped':
          // TODO: Handle shipment
          this.logger.log('Order shipment detected - to be implemented');
          break;
        case 'Delivered':
          // TODO: Handle delivery
          this.logger.log('Order delivery detected - to be implemented');
          break;
        default:
          this.logger.log(`Unhandled status: ${packageStatus}`);
      }

      return {
        success: true,
        message: `Status ${packageStatus} received`,
        status: packageStatus,
      };
    } catch (error) {
      this.logger.error('Error in orderStatusWebhook', error);
      throw new HttpException(
        `Error processing status webhook: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
