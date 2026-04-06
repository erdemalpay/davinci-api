import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  ProcessedHepsiburadaClaim,
} from './processed-hepsiburada-claim.schema';

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
  private readonly catalogAxiosInstance: AxiosInstance;
  private readonly omsAxiosInstance: AxiosInstance;
  private readonly baseUrl: string;
  private readonly listingBaseUrl: string;
  private readonly catalogBaseUrl: string;
  private readonly omsBaseUrl: string;
  private readonly merchantId: string;
  private readonly secretKey: string;
  private readonly userAgent: string;
  private readonly OnlineStoreLocation = 4; // Location ID for online store (UI)
  private readonly OnlineStoreStockLocation = 6; // Location ID for stock management

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(ProcessedHepsiburadaClaim.name)
    private readonly processedHepsiburadaClaimModel: Model<ProcessedHepsiburadaClaim>,
    private readonly userService: UserService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {
    const isProduction = process.env.NODE_ENV === 'production';

    this.baseUrl = this.configService.get<string>(
      isProduction
        ? 'HEPSIBURADA_PRODUCTION_BASE_URL'
        : 'HEPSIBURADA_STAGING_BASE_URL',
    );
    this.listingBaseUrl = isProduction
      ? 'https://listing-external.hepsiburada.com'
      : 'https://listing-external-sit.hepsiburada.com';
    this.catalogBaseUrl = isProduction
      ? 'https://mpop.hepsiburada.com'
      : 'https://mpop-sit.hepsiburada.com';
    this.omsBaseUrl = isProduction
      ? 'https://oms-external.hepsiburada.com'
      : 'https://oms-external-sit.hepsiburada.com';
    this.merchantId = this.configService.get<string>(
      isProduction
        ? 'HEPSIBURADA_PRODUCTION_MERCHANT_ID'
        : 'HEPSIBURADA_STAGING_MERCHANT_ID',
    );
    this.secretKey = this.configService.get<string>(
      isProduction
        ? 'HEPSIBURADA_PRODUCTION_SECRET_KEY'
        : 'HEPSIBURADA_STAGING_SECRET_KEY',
    );
    this.userAgent = this.configService.get<string>(
      isProduction
        ? 'HEPSIBURADA_PRODUCTION_USER_AGENT'
        : 'HEPSIBURADA_STAGING_USER_AGENT',
    );

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

    // Create axios instance for catalog API (mpop)
    this.catalogAxiosInstance = axios.create({
      baseURL: this.catalogBaseUrl,
      headers: {
        Authorization: `Basic ${authToken}`,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
    });

    // Create axios instance for OMS API (claims/returns)
    this.omsAxiosInstance = axios.create({
      baseURL: this.omsBaseUrl,
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

      const response = await this.catalogAxiosInstance.get(
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

      const response = await this.catalogAxiosInstance.get(
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
            paidQuantity: 0,
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
   * Hepsiburada'dan son 30 gün içindeki talepleri (claim) çeker.
   * API: GET /claims/merchantId/{merchantId}?limit={limit}&offset={offset}
   *
   * @param limit Sayfa başına kayıt sayısı (default 100)
   */
  async getAllClaims(limit: number = 100): Promise<any[]> {
    const allClaims: any[] = [];
    let offset = 0;
    let hasMore = true;

    this.logger.log('Starting to fetch all Hepsiburada claims...');

    try {
      while (hasMore) {
        const response = await this.omsAxiosInstance.get(
          `/claims/merchantId/${this.merchantId}`,
          {
            params: { limit, offset },
          },
        );

        const data = response.data;

        // Hepsiburada API response formatı: array ya da { items: [] } olabilir
        const items: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.content)
              ? data.content
              : [];

        allClaims.push(...items);

        this.logger.log(
          `Fetched ${items.length} claims (offset: ${offset}, total so far: ${allClaims.length})`,
        );

        // Daha az kayıt geldiyse son sayfadayız
        if (items.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      this.logger.log(`Completed fetching ${allClaims.length} Hepsiburada claims`);
      return allClaims;
    } catch (error) {
      this.logger.error('Error fetching Hepsiburada claims:', error.message);
      if (error.response) {
        this.logger.error(
          'Response data:',
          JSON.stringify(error.response.data),
        );
      }
      throw new HttpException(
        `Failed to fetch Hepsiburada claims: ${error?.response?.data?.message || error?.message || 'Unknown error'}`,
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Hepsiburada'dan son 1 ay içindeki iade taleplerini işler.
   * "AwaitingAction" veya "Return" statüsündeki claim'leri bulur ve
   * kendi sistemimizde iptal edilmemiş olan siparişleri iptal eder.
   *
   * İdempotency: Her claimNumber için yalnızca bir kez işlem yapar.
   * Bu metot cron servisi tarafından periyodik olarak çağrılır.
   */
  async processAcceptedClaims() {
    this.logger.log('Starting to process Hepsiburada accepted claims...');

    try {
      const allClaims = await this.getAllClaims();
      this.logger.log(`Fetched ${allClaims.length} claims to process`);

      let processedCount = 0;
      let skippedCount = 0;
      let cancelledCount = 0;
      let errorCount = 0;

      for (const claim of allClaims) {
        try {
          // Hepsiburada claim fields (field isimleri küçük/büyük harfe göre değişebilir)
          const claimNumberRaw =
            claim.claimNumber ??
            claim.ClaimNumber ??
            claim.number ??
            claim.Number ??
            claim.id ??
            claim.Id;
          const orderNumberRaw =
            claim.orderNumber ?? claim.OrderNumber ?? claim.ordernumber;
          const claimNumber = claimNumberRaw?.toString?.() ?? claimNumberRaw;
          const orderNumber = orderNumberRaw?.toString?.() ?? orderNumberRaw;
          const claimType = claim.type ?? claim.claimType ?? claim.Type;
          const status = claim.status ?? claim.Status;
          const claimDate = claim.claimDate ?? claim.ClaimDate;

          if (!claimNumber || !orderNumber) {
            skippedCount++;
            this.logger.warn(
              `Skipping claim without claimNumber or orderNumber: ${JSON.stringify(claim)}`,
            );
            continue;
          }

          // Sadece Return (iade) tipindeki claim'leri işle
          const isReturnClaim =
            !claimType ||
            claimType === 'Return' ||
            claimType === 'İade' ||
            claimType === 'RETURN';

          if (!isReturnClaim) {
            skippedCount++;
            this.logger.debug(
              `Skipping non-return claim ${claimNumber} (type: ${claimType})`,
            );
            continue;
          }

          // Sadece onaylanmış/iadeye dönmüş claim'leri işle
          const normalizedStatus =
            typeof status === 'string' ? status.toLowerCase() : '';
          const isAcceptedOrRefunded =
            normalizedStatus === 'accepted' || normalizedStatus === 'refunded';
          if (!isAcceptedOrRefunded) {
            skippedCount++;
            this.logger.debug(
              `Skipping claim ${claimNumber} due to status: ${status ?? 'unknown'}`,
            );
            continue;
          }

          // İdempotency kontrolü: Bu claim'i daha önce işledik mi?
          const existingProcessed = await this.processedHepsiburadaClaimModel
            .findOne({ claimNumber })
            .exec();

          if (existingProcessed) {
            skippedCount++;
            this.logger.debug(
              `Claim ${claimNumber} already processed, skipping`,
            );
            continue;
          }

          this.logger.log(
            `Processing claim ${claimNumber} (orderNumber: ${orderNumber}, status: ${status}, type: ${claimType})`,
          );

          // Mevcut handleCancelOrder metodunu kullanarak iptali gerçekleştir
          // lineItemId varsa sadece o ürünü iptal et (kısmi iade desteği)
          const lineItemId = claim.lineItemId ?? claim.LineItemId;
          const quantity = claim.quantity ?? claim.Quantity ?? 1;
          const cancelData = {
            id: lineItemId,       // handleCancelOrder lineItemId'yi data.id'den okuyor
            orderNumber: orderNumber,
            quantity: quantity,
          };

          const result = await this.handleCancelOrder(cancelData);

          // İşlem kaydını oluştur (idempotency için)
          await this.processedHepsiburadaClaimModel.create({
            claimNumber,
            orderNumber,
            statusAtProcess: status || 'unknown',
            claimType: claimType || 'Return',
            action: 'CANCEL_ORDER',
            success: result?.success ?? true,
            processedAt: new Date(),
            claimDate: claimDate ? new Date(claimDate) : undefined,
            metadata: {
              claimType,
              explanation: claim.explanation ?? claim.Explanation,
              quantity: claim.quantity ?? claim.Quantity,
              cancelledOrdersCount: result?.ordersCancelled ?? (result?.success ? 1 : 0),
            },
          });

          processedCount++;
          cancelledCount += result?.ordersCancelled ?? (result?.success ? 1 : 0);

          this.logger.log(
            `Claim ${claimNumber} processed successfully (orderNumber: ${orderNumber})`,
          );
        } catch (claimError) {
          this.logger.error(
            `Error processing claim ${claim?.claimNumber}:`,
            claimError,
          );
          errorCount++;
        }
      }

      const summary = {
        success: true,
        message: 'Hepsiburada accepted claims processing completed',
        stats: {
          totalClaimsChecked: allClaims.length,
          processed: processedCount,
          skipped: skippedCount,
          cancelled: cancelledCount,
          errors: errorCount,
        },
      };

      this.logger.log(
        `Hepsiburada claims processing completed: ${JSON.stringify(summary.stats)}`,
      );

      return summary;
    } catch (error) {
      this.logger.error('Error in Hepsiburada processAcceptedClaims:', error);
      throw error;
    }
  }

  /**
   * Handle order cancellation from Hepsiburada
   */
  async handleCancelOrder(data?: any, lineitemIdFromUrl?: string) {
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

      // Webhook body'de alan adı '_id' (alt çizgili), ayrıca URL parametresi de kullanılabilir
      const lineItemId =
        lineitemIdFromUrl ||
        (data?._id?.toString?.() ?? data?._id) ||
        (data?.id?.toString?.() ?? data?.id);
      // Webhook body'de 'Quantity' (PascalCase) olarak geliyor
      const cancelQuantity = Number(
        data?.Quantity ?? data?.quantity ?? 0,
      );
      const orderNumber =
        data?.orderNumber || data?.OrderNumber || data?.items?.[0]?.orderNumber;
      const orderNumberString =
        orderNumber?.toString?.() ?? orderNumber;

      if (!orderNumber) {
        this.logger.warn('No order number provided in cancel webhook');
        return { success: false, message: 'No order number provided' };
      }

      this.logger.log(`Cancelling Hepsiburada order: ${orderNumberString}, lineItemId: ${lineItemId}, quantity: ${cancelQuantity}`);

      if (lineItemId) {
        const qty = cancelQuantity > 0 ? cancelQuantity : 1;

        try {
          await this.orderService.cancelHepsiburadaOrder(
            constantUser,
            lineItemId,
            qty,
          );
        } catch (cancelErr) {
          const message = cancelErr?.message || '';
          // Sipariş zaten iptal edilmişse veya bulunamıyorsa başarılı say (idempotency)
          if (
            message.includes('already cancelled') ||
            message.includes('Order not found') ||
            (cancelErr instanceof HttpException &&
              (cancelErr.getStatus() === HttpStatus.NOT_FOUND ||
                cancelErr.getStatus() === HttpStatus.BAD_REQUEST))
          ) {
            this.logger.warn(
              `Cancel webhook for line item ${lineItemId} skipped: ${message}`,
            );
            return {
              success: true,
              message: 'Order already processed',
              ordersCancelled: 0,
            };
          }
          throw cancelErr;
        }

        this.websocketGateway.emitOrderGroupChanged();

        return {
          success: true,
          message: 'Order cancellation processed',
          cancelledQuantity: qty,
          ordersCancelled: 1,
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

      for (const order of orders) {
        if (order.status === OrderStatus.CANCELLED) {
          this.logger.log(`Order ${order._id} is already cancelled, skipping`);
          continue;
        }

        try {
          await this.orderService.cancelHepsiburadaOrder(
            constantUser,
            order.hepsiburadaLineItemId,
            order.quantity,
          );
          cancelledCount++;
        } catch (err) {
          this.logger.error(`Error cancelling order ${order._id}:`, err);
        }
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
