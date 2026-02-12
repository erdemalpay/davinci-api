import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios, { AxiosInstance } from 'axios';
import { Model } from 'mongoose';
import { AccountingService } from '../accounting/accounting.service';
import { MenuService } from '../menu/menu.service';
import { OrderService } from '../order/order.service';
import { UserService } from '../user/user.service';
import { OrderStatus, OrderCollectionStatus } from '../order/order.dto';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { Order } from '../order/order.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';

interface PopulatedMenuItem {
  itemProduction?: Array<{
    isDecrementStock?: boolean;
    quantity?: number;
    product?: any;
  }>;
}

function isPopulatedMenuItem(item: unknown): item is PopulatedMenuItem {
  return typeof item === 'object' && item !== null && 'itemProduction' in item;
}

@Injectable()
export class HepsiburadaService {
  private readonly logger = new Logger(HepsiburadaService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly listingAxiosInstance: AxiosInstance;
  private readonly baseUrl = process.env.HEPSIBURADA_STAGING_BASE_URL!;
  private readonly listingBaseUrl =
    'https://listing-external-sit.hepsiburada.com';
  private readonly merchantId = process.env.HEPSIBURADA_STAGING_MERCHANT_ID!;
  private readonly secretKey = process.env.HEPSIBURADA_STAGING_SECRET_KEY!;
  private readonly userAgent = process.env.HEPSIBURADA_STAGING_USER_AGENT!;
  private readonly OnlineStoreLocation = 4; // Location ID for online store (UI)
  private readonly OnlineStoreStockLocation = 6; // Location ID for stock management

  constructor(
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly userService: UserService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {
    // Create Basic Auth token
    const authToken = Buffer.from(
      `${this.merchantId}:${this.secretKey}`,
    ).toString('base64');

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${authToken}`,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
    });

    // Create axios instance for listing API
    this.listingAxiosInstance = axios.create({
      baseURL: this.listingBaseUrl,
      headers: {
        Authorization: `Basic ${authToken}`,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get products for a merchant with pagination
   * @param barcode Optional barcode filter
   * @param merchantSku Optional merchant SKU filter
   * @param hbSku Optional Hepsiburada SKU filter
   * @param page Page number (default: 0)
   * @param size Size per page (max: 1000, default: 1000)
   */
  async getProducts(
    barcode?: string,
    merchantSku?: string,
    hbSku?: string,
    page: number = 0,
    size: number = 1000,
  ) {
    try {
      const params: any = { page, size };
      if (barcode) params.barcode = barcode;
      if (merchantSku) params.merchantSku = merchantSku;
      if (hbSku) params.hbSku = hbSku;

      const response = await this.axiosInstance.get(
        `/product/api/products/all-products-of-merchant/${this.merchantId}`,
        { params },
      );
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching products:', error.message);
      throw error;
    }
  }

  /**
   * Get products by merchant and status (more accurate, real-time data)
   * @param productStatus Product status (MATCHED, WAITING, APPROVED, etc.)
   * @param taskStatus Optional filter for products with open tasks
   * @param version API version (default: 1)
   * @param page Page number (default: 0)
   * @param size Size per page (max: 1000, default: 1000)
   */
  async getProductsByStatus(
    productStatus: string = 'MATCHED',
    taskStatus?: boolean,
    version: number = 1,
    page: number = 0,
    size: number = 1000,
  ) {
    try {
      const params: any = {
        merchantId: this.merchantId,
        productStatus,
        version,
        page,
        size,
      };
      if (taskStatus !== undefined) params.taskStatus = taskStatus;

      const response = await this.axiosInstance.get(
        `/product/api/products/products-by-merchant-and-status`,
        { params },
      );
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching products by status:', error.message);
      throw error;
    }
  }

  /**
   * Get ALL products for a merchant (fetches all pages automatically)
   * @param barcode Optional barcode filter
   * @param merchantSku Optional merchant SKU filter
   * @param hbSku Optional Hepsiburada SKU filter
   */
  async getAllProducts(barcode?: string, merchantSku?: string, hbSku?: string) {
    try {
      const allProducts: any[] = [];
      let currentPage = 0;
      let totalPages = 1;

      while (currentPage < totalPages) {
        const response = await this.getProducts(
          barcode,
          merchantSku,
          hbSku,
          currentPage,
          1000,
        );

        if (response.success && response.data) {
          allProducts.push(...response.data);
          totalPages = response.totalPages;
          currentPage++;
        } else {
          break;
        }
      }

      return {
        success: true,
        totalProducts: allProducts.length,
        products: allProducts,
      };
    } catch (error) {
      this.logger.error('Error fetching all products:', error.message);
      throw error;
    }
  }

  /**
   * Update price for a single product
   * @param hepsiburadaSku Optional Hepsiburada SKU (hbSku)
   * @param merchantSku Optional merchant SKU
   * @param price New price to set
   */
  async updateProductPrice(
    hepsiburadaSku?: string,
    merchantSku?: string,
    price?: number,
  ) {
    try {
      const payload: any = {};
      if (hepsiburadaSku) payload.hepsiburadaSku = hepsiburadaSku;
      if (merchantSku) payload.merchantSku = merchantSku;
      if (price !== undefined && price !== null) payload.price = price;

      const response = await this.listingAxiosInstance.post(
        `/listings/merchantid/${this.merchantId}/price-uploads`,
        [payload],
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Error updating product price for ${hepsiburadaSku || merchantSku}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Check the status of a price update batch
   * @param batchId The batch ID returned from price upload
   */
  async checkPriceUpdateStatus(batchId: string) {
    try {
      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}/price-uploads/id/${batchId}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error checking price update status for batch ${batchId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get current listings with prices
   * This returns actual listing data including current prices
   */
  async getListings(page: number = 0, limit: number = 1000) {
    try {
      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}`,
        {
          params: { offset: page, limit },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching listings:', error.message);
      if (error.response) {
        this.logger.error(
          'Response data:',
          JSON.stringify(error.response.data),
        );
      }
      throw error;
    }
  }

  /**
   * Check the status of an inventory update batch
   * @param inventoryUploadId The inventory upload ID returned from inventory upload
   */
  async checkInventoryUploadStatus(inventoryUploadId: string) {
    try {
      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}/inventory-uploads/id/${inventoryUploadId}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error checking inventory upload status for ${inventoryUploadId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Update stock for a single product by its Hepsiburada SKU (hbSku).
   * Fetches the current listing to resolve merchantSku automatically.
   * @param hbSku Hepsiburada SKU stored on MenuItem (hepsiBuradaSku)
   * @param availableStock New stock quantity
   * @param price Price to send alongside the stock update
   */
  async updateStockByHbSku(
    hbSku: string,
    availableStock: number,
    price: number,
  ) {
    // Fetch current listings to resolve merchantSku
    const listingsResponse = await this.getListings();
    const listings: Array<{ hepsiburadaSku: string; merchantSku: string }> =
      listingsResponse?.listings ?? listingsResponse ?? [];

    const listing = listings.find(
      (l) => l.hepsiburadaSku === hbSku || l.merchantSku === hbSku,
    );

    if (!listing) {
      this.logger.warn(
        `[HB] No listing found for hbSku ${hbSku}, skipping stock update`,
      );
      return;
    }

    return this.updateProductInventory([
      {
        hepsiburadaSku: listing.hepsiburadaSku,
        merchantSku: listing.merchantSku,
        availableStock,
        price,
      },
    ]);
  }

  /**
   * Update inventory (stock) for a single product or batch of products
   * @param inventoryUpdates Array of inventory updates
   */
  async updateProductInventory(
    inventoryUpdates: Array<{
      hepsiburadaSku?: string;
      merchantSku: string;
      availableStock: number;
      price: number;
    }>,
  ) {
    try {
      const response = await this.listingAxiosInstance.post(
        `/listings/merchantid/${this.merchantId}/inventory-uploads`,
        inventoryUpdates,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error updating inventory:`, error.message);
      if (error.response) {
        this.logger.error(
          'Error response:',
          JSON.stringify(error.response.data),
        );
      }
      throw error;
    }
  }

  /**
   * Update prices for all menu items that have matching Hepsiburada products
   * Matches items by hbSku field (hepsiBuradaSku in item schema)
   * Uses batch API call for better performance
   */
  async updateAllItemPrices() {
    try {
      const { products: hepsiburadaProducts } = await this.getAllProducts();
      const menuItems = await this.menuService.findItemsWithHepsiBuradaSku();

      // Create Map for O(1) lookups instead of O(N) find
      const productMap = new Map(
        hepsiburadaProducts.map((product) => [product.hbSku, product]),
      );

      // Collect all price updates for batch request
      const priceUpdates: any[] = [];
      const skipped: any[] = [];

      for (const item of menuItems) {
        if (!item.hepsiBuradaSku) {
          skipped.push({
            itemName: item.name,
            reason: 'No hepsiBuradaSku',
          });
          continue;
        }

        // O(1) lookup using Map
        const matchingProduct = productMap.get(item.hepsiBuradaSku);

        if (!matchingProduct) {
          this.logger.warn(
            `No Hepsiburada product found for item ${item.name} with hbSku ${item.hepsiBuradaSku}`,
          );
          skipped.push({
            itemName: item.name,
            hbSku: item.hepsiBuradaSku,
            reason: 'No matching product',
          });
          continue;
        }

        // Use online price if available, otherwise use regular price
        const priceToUpdate = item.onlinePrice || item.price;

        priceUpdates.push({
          hepsiburadaSku: matchingProduct.hbSku,
          merchantSku: matchingProduct.merchantSku,
          price: priceToUpdate,
          _itemName: item.name, // For logging only
        });
      }

      this.logger.log(
        `Prepared ${priceUpdates.length} price updates, ${skipped.length} skipped`,
      );

      if (priceUpdates.length === 0) {
        return {
          total: 0,
          successful: 0,
          failed: 0,
          skipped: skipped.length,
          details: skipped,
        };
      }

      const cleanedUpdates = priceUpdates.map(({ _itemName, ...rest }) => rest);

      try {
        const response = await this.listingAxiosInstance.post(
          `/listings/merchantid/${this.merchantId}/price-uploads`,
          cleanedUpdates,
        );

        return {
          total: priceUpdates.length,
          successful: priceUpdates.length,
          failed: 0,
          skipped: skipped.length,
          batchId: response.data.id,
          details: priceUpdates.map((update) => ({
            itemName: update._itemName,
            hbSku: update.hepsiburadaSku,
            merchantSku: update.merchantSku,
            price: update.price,
            status: 'queued',
          })),
        };
      } catch (error) {
        this.logger.error('Failed to update price batch:', error.message);
        if (error.response) {
          this.logger.error(
            'Response data:',
            JSON.stringify(error.response.data),
          );
        }

        return {
          total: priceUpdates.length,
          successful: 0,
          failed: priceUpdates.length,
          skipped: skipped.length,
          error: error.message,
          details: priceUpdates.map((update) => ({
            itemName: update._itemName,
            hbSku: update.hepsiburadaSku,
            merchantSku: update.merchantSku,
            price: update.price,
            status: 'failed',
            error: error.message,
          })),
        };
      }
    } catch (error) {
      this.logger.error('Error in updateAllItemPrices:', error.message);
      throw error;
    }
  }

  /**
   * Update price for a single menu item by its Hepsiburada SKU
   * @param hbSku Hepsiburada SKU of the item
   * @param price New price to set
   */
  async updateSingleItemPrice(hbSku: string, price: number) {
    try {
      // Fetch the product to get merchantSku
      const { products: hepsiburadaProducts } = await this.getAllProducts();
      const product = hepsiburadaProducts.find((p) => p.hbSku === hbSku);

      if (!product) {
        throw new Error(`Product not found for hbSku: ${hbSku}`);
      }

      // Use batch API with single item
      const response = await this.listingAxiosInstance.post(
        `/listings/merchantid/${this.merchantId}/price-uploads`,
        [
          {
            hepsiburadaSku: hbSku,
            merchantSku: product.merchantSku,
            price: price,
          },
        ],
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Error updating price for hbSku ${hbSku}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Update stocks for all menu items that have matching Hepsiburada products
   * Fetches actual stock quantities from accounting service like Shopify integration
   * Matches items by hbSku field (hepsiBuradaSku in item schema)
   */
  async updateAllItemStocks() {
    try {
      const menuItems = await this.menuService.findItemsWithHepsiBuradaSku();

      if (menuItems.length === 0) {
        return {
          total: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
          details: [],
        };
      }

      const { products: hepsiburadaProducts } = await this.getAllProducts();

      // Create Map for O(1) lookups
      const productMap = new Map(
        hepsiburadaProducts.map((product) => [product.hbSku, product]),
      );

      const ONLINE_STORE_LOCATION_ID = 6;
      const inventoryUpdates = [];

      for (const item of menuItems) {
        if (!item.hepsiBuradaSku) continue;

        const hbProduct = productMap.get(item.hepsiBuradaSku);
        if (!hbProduct) continue;

        let stockValue = 0;
        if (item.matchedProduct) {
          try {
            const productStocks =
              await this.accountingService.findProductStockByLocation(
                item.matchedProduct,
                ONLINE_STORE_LOCATION_ID,
              );
            stockValue = productStocks.reduce(
              (total, stock) => total + (stock.quantity || 0),
              0,
            );
          } catch (error) {
            // Silently continue with 0 stock on error
          }
        }

        inventoryUpdates.push({
          hepsiburadaSku: item.hepsiBuradaSku,
          merchantSku: hbProduct.merchantSku,
          availableStock: stockValue,
          price: item.onlinePrice || item.price,
        });
      }

      try {
        const response = await this.updateProductInventory(inventoryUpdates);

        return {
          total: inventoryUpdates.length,
          successful: inventoryUpdates.length,
          failed: 0,
          skipped: menuItems.length - inventoryUpdates.length,
          batchId: response.id,
        };
      } catch (error) {
        this.logger.error('Failed to update inventory batch:', error.message);
        return {
          total: inventoryUpdates.length,
          successful: 0,
          failed: inventoryUpdates.length,
          skipped: menuItems.length - inventoryUpdates.length,
          error: error.message,
        };
      }
    } catch (error) {
      this.logger.error('Error in updateAllItemStocks:', error.message);
      throw error;
    }
  }

  /**
   * Match menu items with Hepsiburada products by barcode.
   * For each provided itemId, finds the item's barcode, searches Hepsiburada
   * for a matching product, and updates the item's hepsiBuradaSku field.
   * @param itemIds Array of menu item IDs to match
   */
  async matchItemsByBarcode(itemIds: number[]) {
    const results: Array<{
      itemId: number;
      itemName: string;
      barcode?: string;
      hbSku?: string;
      status: 'matched' | 'not_found' | 'no_barcode' | 'error';
      error?: string;
    }> = [];

    const allItems = await this.menuService.findAllItems();
    const targetItems = allItems.filter((item) =>
      itemIds.includes(item._id as number),
    );

    for (const item of targetItems) {
      if (!item.barcode) {
        results.push({
          itemId: item._id as number,
          itemName: item.name,
          status: 'no_barcode',
        });
        continue;
      }

      try {
        const response = await this.getProducts(item.barcode);
        let products: any[] = response?.data ?? [];
        let match = products.find((p) => p.barcode === item.barcode);

        // Leading zero sorunu: Hepsiburada barkodu sayıya çevirmiş olabilir
        // Örn: "0000002013947" → "2013947"
        if (!match) {
          const trimmedBarcode = item.barcode.replace(/^0+/, '');
          const response2 = await this.getProducts(trimmedBarcode);
          products = response2?.data ?? [];
          match = products.find(
            (p) =>
              p.barcode === trimmedBarcode ||
              p.barcode === item.barcode ||
              p.barcode?.replace(/^0+/, '') === trimmedBarcode,
          );
        }

        if (!match) {
          results.push({
            itemId: item._id as number,
            itemName: item.name,
            barcode: item.barcode,
            status: 'not_found',
          });
          continue;
        }

        await this.menuService.updateItemField(item._id as number, {
          hepsiBuradaSku: match.hbSku,
        });

        results.push({
          itemId: item._id as number,
          itemName: item.name,
          barcode: item.barcode,
          hbSku: match.hbSku,
          status: 'matched',
        });
      } catch (error) {
        this.logger.error(
          `Error matching item ${item.name} (barcode: ${item.barcode}):`,
          error.message,
        );
        results.push({
          itemId: item._id as number,
          itemName: item.name,
          barcode: item.barcode,
          status: 'error',
          error: error.message,
        });
      }
    }

    const matched = results.filter((r) => r.status === 'matched').length;
    const notFound = results.filter((r) => r.status === 'not_found').length;
    const noBarcode = results.filter((r) => r.status === 'no_barcode').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return {
      total: targetItems.length,
      matched,
      notFound,
      noBarcode,
      errors,
      results,
    };
  }

  /**
   * Hepsiburada webhook'tan gelen yeni sipariş bildirimini işler
   */
  async orderWebhook(data?: any) {
    this.logger.log('Processing Hepsiburada order webhook...');
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

      // Hepsiburada webhook format: items (küçük harf) veya LineItems (büyük harf)
      const lineItems = data?.items ?? data?.LineItems ?? [];
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

      const createdOrders: Array<{
        order: number;
        paidQuantity: number;
        amount: number;
        menuItemName?: string;
      }> = [];
      let totalAmount = 0;

      for (const lineItem of lineItems) {
        try {
          // Hepsiburada webhook format - hem büyük hem küçük harfli field'lari destekle
          const sku = lineItem.sku || lineItem.Sku;
          const lineItemId =
            lineItem.id ||
            lineItem.Id ||
            lineItem.lineItemId ||
            lineItem.LineItemId;
          const quantity = lineItem.quantity || lineItem.Quantity;
          const unitPrice = lineItem.unitPrice || lineItem.Price;
          const totalPrice = lineItem.totalPrice || lineItem.TotalPrice;
          const orderNumber = lineItem.orderNumber || data?.orderNumber || data?.OrderNumber;
          const orderDate = lineItem.orderDate || data?.orderDate || data?.OrderDate;

          if (!sku || !quantity) {
            this.logger.warn(
              'Invalid line item data - missing sku or quantity',
            );
            this.logger.debug('Line item:', lineItem);
            continue;
          }

          // Find menu item by Hepsiburada SKU
          const foundMenuItem = await this.menuService.findByHepsiBuradaSku(sku);

          if (!foundMenuItem) {
            this.logger.warn(
              `No menu item found with Hepsiburada SKU: ${sku}`,
            );
            continue;
          }

          // Calculate amounts - handle both formats
          let itemAmount = 0;
          let pricePerUnit = 0;

          if (totalPrice?.amount !== undefined) {
            // Format: { amount: 100, currency: "TRY" }
            itemAmount = totalPrice.amount;
            pricePerUnit = unitPrice?.amount || (itemAmount / quantity);
          } else if (totalPrice?.Amount !== undefined) {
            // Format: { Amount: 100, Currency: "TRY" }
            itemAmount = totalPrice.Amount;
            pricePerUnit = unitPrice?.Amount || (itemAmount / quantity);
          } else if (unitPrice?.amount !== undefined) {
            pricePerUnit = unitPrice.amount;
            itemAmount = pricePerUnit * quantity;
          } else if (unitPrice?.Amount !== undefined) {
            pricePerUnit = unitPrice.Amount;
            itemAmount = pricePerUnit * quantity;
          }

          this.logger.log(
            `Processing order item: SKU=${sku}, Quantity=${quantity}, UnitPrice=${pricePerUnit}, Total=${itemAmount}`,
          );

          // Create order
          const order = await this.orderService.createOrder(constantUser, {
            location: this.OnlineStoreLocation,
            stockLocation: this.OnlineStoreStockLocation,
            item: foundMenuItem._id,
            quantity: quantity,
            status: OrderStatus.AUTOSERVED,
            unitPrice: pricePerUnit,
            paidQuantity: quantity,
            createdAt: new Date(orderDate || Date.now()),
            createdBy: constantUser._id,
            paymentMethod: 'hepsiburada',
            tableDate: new Date(),
            hepsiburadaOrderNumber: orderNumber,
            hepsiburadaLineItemId: lineItemId,
            hepsiburadaLineItemSku: sku,
            stockNote: StockHistoryStatusEnum.HEPSIBURADAORDERCREATE,
          });

          this.logger.log('Order created:', order._id);

          createdOrders.push({
            order: order._id,
            paidQuantity: quantity,
            amount: itemAmount,
            menuItemName: foundMenuItem.name,
          });
          totalAmount += itemAmount;
        } catch (itemError) {
          this.logger.error('Error processing line item', itemError);
        }
      }

      // Create a single collection for all orders from this Hepsiburada order
      if (createdOrders.length > 0) {
        const hepsiburadaOrderNumber = data?.orderNumber || data?.OrderNumber || data?.items?.[0]?.orderNumber;

        const createdCollection = {
          location: this.OnlineStoreLocation,
          paymentMethod: 'hepsiburada',
          amount: totalAmount,
          status: OrderCollectionStatus.PAID,
          orders: createdOrders.map(({ order, paidQuantity }) => ({
            order,
            paidQuantity,
          })),
          createdBy: constantUser._id,
          tableDate: new Date(),
          ...(hepsiburadaOrderNumber && {
            hepsiburadaOrderNumber: hepsiburadaOrderNumber.toString(),
          }),
        };

        try {
          const collection = await this.orderService.createCollection(
            constantUser,
            createdCollection,
          );
          this.logger.log('Collection created:', collection._id);

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
      this.logger.error('Error in orderWebhook', error);
      throw new HttpException(
        `Error processing webhook: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Handle order cancellation from Hepsiburada
   */
  async handleCancelOrder(data?: any) {
    this.logger.log('Processing Hepsiburada order cancellation...');
    this.logger.debug('Cancel data:', JSON.stringify(data, null, 2));

    try {
      const constantUser = await this.userService.findByIdWithoutPopulate('dv');
      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      const lineItemId = data?.id?.toString?.() ?? data?.id;
      const cancelQuantity = Number(data?.quantity ?? 0);
      const orderNumber =
        data?.orderNumber || data?.OrderNumber || data?.items?.[0]?.orderNumber;
      const orderNumberString =
        orderNumber?.toString?.() ?? orderNumber;

      if (!orderNumber) {
        this.logger.warn('No order number provided in cancel webhook');
        return { success: false, message: 'No order number provided' };
      }

      this.logger.log(`Cancelling Hepsiburada order: ${orderNumberString}`);

      const restoreStock = async (order: Order, quantity: number) => {
        if (!quantity || quantity <= 0) return;
        if (isPopulatedMenuItem(order?.item)) {
          for (const ingredient of order.item.itemProduction ?? []) {
            if (ingredient?.isDecrementStock) {
              const incrementQuantity = (ingredient?.quantity ?? 0) * quantity;
              if (incrementQuantity > 0) {
                await this.accountingService.createStock(constantUser, {
                  product: ingredient?.product,
                  location: order?.stockLocation ?? order?.location,
                  quantity: incrementQuantity,
                  status: StockHistoryStatusEnum.HEPSIBURADAORDERCANCEL,
                });
              }
            }
          }
        }
      };

      if (lineItemId) {
        if (!cancelQuantity || cancelQuantity <= 0) {
          this.logger.warn(
            `Invalid cancel quantity for line item ${lineItemId}: ${cancelQuantity}`,
          );
          return { success: false, message: 'Invalid cancel quantity' };
        }

        let orders = await this.orderService.findQueryOrders({
          hepsiburadaLineItemId: lineItemId,
        });

        if (!orders || orders.length === 0) {
          orders = await this.orderService.findQueryOrders({
            hepsiburadaLineItemSku: lineItemId,
          });
        }

        if (!orders || orders.length === 0) {
          this.logger.warn(
            `No order found with Hepsiburada line item id or SKU: ${lineItemId}`,
          );
          return { success: false, message: 'No order found to cancel' };
        }

        if (orders.length > 1) {
          this.logger.warn(
            `Multiple orders found for line item ${lineItemId}, using an active order`,
          );
        }

        const targetOrder =
          orders.find((order) => order.status !== OrderStatus.CANCELLED) ??
          orders[0];

        const baseOrder = await this.orderModel
          .findById(targetOrder._id)
          .populate('item');

        if (!baseOrder) {
          this.logger.warn(
            `Order ${targetOrder._id} not found for cancellation`,
          );
          return { success: false, message: 'Order not found to cancel' };
        }

        if (baseOrder.status === OrderStatus.CANCELLED) {
          this.logger.log(`Order ${baseOrder._id} is already cancelled`);
          return { success: true, message: 'Order already cancelled' };
        }

        if (cancelQuantity > baseOrder.quantity) {
          this.logger.warn(
            `Cancel quantity exceeds order quantity for ${baseOrder._id}`,
          );
          return { success: false, message: 'Invalid cancel quantity' };
        }

        const cancelledAmount = baseOrder.unitPrice * cancelQuantity;
        let updatedOrder: Order | null = null;
        let cancelledOrder: Order | null = null;
        let remainingQuantity = 0;

        if (baseOrder.quantity !== cancelQuantity) {
          remainingQuantity = baseOrder.quantity - cancelQuantity;

          const orderWithoutId = baseOrder.toObject();
          delete orderWithoutId._id;

          const [createdCancelledOrder] = await this.orderModel.create([
            {
              ...orderWithoutId,
              quantity: cancelQuantity,
              paidQuantity: cancelQuantity,
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledBy: constantUser._id,
              stockNote: StockHistoryStatusEnum.HEPSIBURADAORDERCANCEL,
            },
          ]);
          cancelledOrder = createdCancelledOrder;

          updatedOrder = await this.orderModel.findByIdAndUpdate(
            baseOrder._id,
            {
              $set: {
                quantity: remainingQuantity,
                paidQuantity: remainingQuantity,
              },
            },
            { new: true },
          );

          await restoreStock(baseOrder, cancelQuantity);
        } else {
          updatedOrder = await this.orderModel.findByIdAndUpdate(
            baseOrder._id,
            {
              $set: {
                status: OrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledBy: constantUser._id,
                stockNote: StockHistoryStatusEnum.HEPSIBURADAORDERCANCEL,
              },
            },
            { new: true },
          );

          await restoreStock(baseOrder, baseOrder.quantity);
        }

        const collections = await this.orderService.findQueryCollections({
          hepsiburadaOrderNumber: orderNumberString,
        });

        if (collections && collections.length > 0) {
          for (const collection of collections) {
            if (collection.status === OrderCollectionStatus.CANCELLED) {
              this.logger.log(
                `Collection ${collection._id} is already cancelled, skipping`,
              );
              continue;
            }

            const orderUpdateMap = new Map<
              string,
              { order: number; paidQuantity: number }
            >();
            for (const orderItem of collection.orders ?? []) {
              orderUpdateMap.set(orderItem.order.toString(), {
                order: orderItem.order,
                paidQuantity: orderItem.paidQuantity,
              });
            }

            if (baseOrder.quantity !== cancelQuantity) {
              orderUpdateMap.set(baseOrder._id.toString(), {
                order: baseOrder._id,
                paidQuantity: remainingQuantity,
              });
            } else {
              orderUpdateMap.delete(baseOrder._id.toString());
            }

            const updatedOrders = Array.from(orderUpdateMap.values());
            const newAmount = Math.max(
              0,
              (collection.amount ?? 0) - cancelledAmount,
            );

            const activeOrders = await this.orderService.findActiveOrdersByIds(
              updatedOrders.map((o) => o.order),
            );

            const updateData: any = {
              orders: updatedOrders,
              amount: newAmount,
            };

            if (activeOrders.length === 0 || newAmount <= 0) {
              updateData.status = OrderCollectionStatus.CANCELLED;
              updateData.cancelledAt = new Date();
              updateData.cancelledBy = constantUser._id;
            }

            await this.orderService.updateCollection(
              constantUser,
              collection._id,
              updateData,
            );
          }
        } else {
          this.logger.warn(
            `No collection found for Hepsiburada order number: ${orderNumberString}`,
          );
        }

        const ordersToEmit = [updatedOrder, cancelledOrder].filter(
          Boolean,
        ) as Order[];
        if (ordersToEmit.length > 0) {
          await this.websocketGateway.emitOrderUpdated(ordersToEmit);
        }
        this.websocketGateway.emitOrderGroupChanged();

        return {
          success: true,
          message: 'Order cancellation processed',
          cancelledQuantity: cancelQuantity,
          isPartial: baseOrder.quantity !== cancelQuantity,
        };
      }

      // Fallback: cancel all orders by order number
      const orders = await this.orderService.findQueryOrders({
        hepsiburadaOrderNumber: orderNumberString,
      });

      if (!orders || orders.length === 0) {
        this.logger.warn(
          `No orders found with Hepsiburada order number: ${orderNumberString}`,
        );
        return { success: false, message: 'No orders found to cancel' };
      }

      this.logger.log(`Found ${orders.length} orders to cancel`);

      let cancelledCount = 0;
      const updatedOrdersToEmit: Order[] = [];

      for (const order of orders) {
        if (order.status === OrderStatus.CANCELLED) {
          this.logger.log(`Order ${order._id} is already cancelled, skipping`);
          continue;
        }

        const orderWithItem = await this.orderModel
          .findById(order._id)
          .populate('item');

        if (!orderWithItem) {
          this.logger.warn(`Order ${order._id} not found for cancellation`);
          continue;
        }

        const updatedOrder = await this.orderModel.findByIdAndUpdate(
          orderWithItem._id,
          {
            $set: {
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledBy: constantUser._id,
              stockNote: StockHistoryStatusEnum.HEPSIBURADAORDERCANCEL,
            },
          },
          { new: true },
        );

        await restoreStock(orderWithItem, orderWithItem.quantity);
        if (updatedOrder) {
          updatedOrdersToEmit.push(updatedOrder);
        }
        cancelledCount++;
      }

      const collections = await this.orderService.findQueryCollections({
        hepsiburadaOrderNumber: orderNumberString,
      });

      if (collections && collections.length > 0) {
        for (const collection of collections) {
          if (collection.status === OrderCollectionStatus.CANCELLED) {
            this.logger.log(
              `Collection ${collection._id} is already cancelled, skipping`,
            );
            continue;
          }

          await this.orderService.updateCollection(
            constantUser,
            collection._id,
            {
              status: OrderCollectionStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledBy: constantUser._id,
            },
          );
          this.logger.log(`Collection ${collection._id} cancelled successfully`);
        }
      }

      if (updatedOrdersToEmit.length > 0) {
        await this.websocketGateway.emitOrderUpdated(updatedOrdersToEmit);
      }
      this.websocketGateway.emitOrderGroupChanged();

      return {
        success: true,
        message: 'Order(s) cancelled successfully',
        ordersCancelled: cancelledCount,
      };
    } catch (error) {
      this.logger.error('Error in handleCancelOrder', error);
      throw new HttpException(
        `Error cancelling order: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
