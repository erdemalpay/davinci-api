import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AccountingService } from '../accounting/accounting.service';
import { MenuService } from '../menu/menu.service';

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

  constructor(
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
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
}
