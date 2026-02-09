import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AccountingService } from '../accounting/accounting.service';
import { MenuService } from '../menu/menu.service';
import { OrderService } from '../order/order.service';
import { UserService } from '../user/user.service';
import { OrderStatus, OrderCollectionStatus } from '../order/order.dto';

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
  private readonly OnlineStoreLocation = 4; // Location ID for online store

  constructor(
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly userService: UserService,
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

      const lineItems = data?.LineItems ?? [];
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
          const {
            Sku,
            MerchantId,
            Quantity,
            Price,
            TotalPrice,
          } = lineItem;

          if (!Sku || !Quantity) {
            this.logger.warn(
              'Invalid line item data - missing Sku or Quantity',
            );
            continue;
          }

          // Find menu item by Hepsiburada SKU
          const foundMenuItem = await this.menuService.findByHepsiBuradaSku(Sku);

          if (!foundMenuItem) {
            this.logger.warn(
              `No menu item found with Hepsiburada SKU: ${Sku}`,
            );
            continue;
          }

          const itemAmount = TotalPrice?.Amount || (Price?.Amount * Quantity) || 0;

          // Create order
          const order = await this.orderService.createOrder(constantUser, {
            location: this.OnlineStoreLocation,
            item: foundMenuItem._id,
            quantity: Quantity,
            status: OrderStatus.READYTOSERVE,
            unitPrice: Price?.Amount || 0,
            paidQuantity: Quantity,
            createdAt: new Date(data?.OrderDate || Date.now()),
            createdBy: constantUser._id,
            paymentMethod: 'hepsiburada',
            tableDate: new Date(),
            hepsiburadaOrderNumber: data?.OrderNumber,
            hepsiburadaLineItemSku: Sku,
          });

          this.logger.log('Order created:', order._id);

          createdOrders.push({
            order: order._id,
            paidQuantity: Quantity,
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
        const hepsiburadaOrderNumber = data?.OrderNumber;

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
}
