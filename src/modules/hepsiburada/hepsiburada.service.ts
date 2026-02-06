import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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
      this.logger.log(`Fetching products - page: ${page}, size: ${size}`);
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
      this.logger.log(
        `Fetching products by status: ${productStatus} - page: ${page}, size: ${size}`,
      );
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
      this.logger.log('Fetching all products from all pages...');
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

          this.logger.log(
            `Fetched page ${currentPage}/${totalPages} - Total products so far: ${allProducts.length}`,
          );
        } else {
          break;
        }
      }

      this.logger.log(
        `Successfully fetched all ${allProducts.length} products`,
      );
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
      this.logger.log(
        `Updating product price - hbSku: ${hepsiburadaSku}, merchantSku: ${merchantSku}, price: ${price}`,
      );

      const payload: any = {};
      if (hepsiburadaSku) payload.hepsiburadaSku = hepsiburadaSku;
      if (merchantSku) payload.merchantSku = merchantSku;
      if (price !== undefined && price !== null) payload.price = price;

      // API expects an array of price updates
      const requestBody = [payload];

      this.logger.log('Request payload:', JSON.stringify(requestBody));

      const response = await this.listingAxiosInstance.post(
        `/listings/merchantid/${this.merchantId}/price-uploads`,
        requestBody,
      );

      this.logger.log(
        `Price update response for ${hepsiburadaSku || merchantSku}:`,
        JSON.stringify(response.data, null, 2),
      );
      this.logger.log(
        `Successfully updated price for product: ${
          hepsiburadaSku || merchantSku
        }`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error updating product price for ${hepsiburadaSku || merchantSku}:`,
        error.message,
      );
      if (error.response) {
        this.logger.error(
          'Response data:',
          JSON.stringify(error.response.data),
        );
        this.logger.error('Response status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Check the status of a price update batch
   * @param batchId The batch ID returned from price upload
   */
  async checkPriceUpdateStatus(batchId: string) {
    try {
      this.logger.log(`Checking price update status for batch: ${batchId}`);

      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}/price-uploads/id/${batchId}`,
      );

      this.logger.log(
        `Price update status response:`,
        JSON.stringify(response.data, null, 2),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error checking price update status for batch ${batchId}:`,
        error.message,
      );
      if (error.response) {
        this.logger.error(
          'Response data:',
          JSON.stringify(error.response.data),
        );
        this.logger.error('Response status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Get current listings with prices
   * This returns actual listing data including current prices
   */
  async getListings(page: number = 0, limit: number = 1000) {
    try {
      this.logger.log(`Fetching listings - page: ${page}, limit: ${limit}`);

      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}`,
        {
          params: { offset: page, limit },
        },
      );

      this.logger.log(
        `Listings response:`,
        JSON.stringify(response.data, null, 2),
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
      this.logger.log(
        `Checking inventory upload status for: ${inventoryUploadId}`,
      );

      const response = await this.listingAxiosInstance.get(
        `/listings/merchantid/${this.merchantId}/inventory-uploads/id/${inventoryUploadId}`,
      );

      this.logger.log(
        `Inventory upload status response:`,
        JSON.stringify(response.data, null, 2),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error checking inventory upload status for ${inventoryUploadId}:`,
        error.message,
      );
      if (error.response) {
        this.logger.error(
          'Response data:',
          JSON.stringify(error.response.data),
        );
        this.logger.error('Response status:', error.response.status);
      }
      throw error;
    }
  }

  /**
   * Update prices for all menu items that have matching Hepsiburada products
   * Matches items by hbSku field (hepsiBuradaSku in item schema)
   */
  async updateAllItemPrices() {
    try {
      this.logger.log('Starting price sync for all menu items...');

      // Get all Hepsiburada products
      const { products: hepsiburadaProducts } = await this.getAllProducts();
      this.logger.log(
        `Found ${hepsiburadaProducts.length} Hepsiburada products`,
      );

      // Get all menu items with Hepsiburada SKU
      const menuItems = await this.menuService.findItemsWithHepsiBuradaSku();
      this.logger.log(
        `Found ${menuItems.length} menu items with Hepsiburada SKU`,
      );

      // Track results
      const results = {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        details: [] as any[],
      };

      // Match items by hbSku and update prices
      for (const item of menuItems) {
        if (!item.hepsiBuradaSku) {
          results.skipped++;
          continue;
        }

        // Find matching Hepsiburada product by hbSku
        const matchingProduct = hepsiburadaProducts.find(
          (product) => product.hbSku === item.hepsiBuradaSku,
        );

        if (!matchingProduct) {
          this.logger.warn(
            `No Hepsiburada product found for item ${item.name} with hbSku ${item.hepsiBuradaSku}`,
          );
          results.skipped++;
          continue;
        }

        results.total++;

        try {
          // Use online price if available, otherwise use regular price
          const priceToUpdate = item.onlinePrice || item.price;

          await this.updateProductPrice(
            matchingProduct.hbSku,
            matchingProduct.merchantSku,
            priceToUpdate,
          );

          results.successful++;
          results.details.push({
            itemName: item.name,
            hbSku: item.hepsiBuradaSku,
            merchantSku: matchingProduct.merchantSku,
            price: priceToUpdate,
            status: 'success',
          });

          this.logger.log(
            `Updated price for ${item.name} - hbSku: ${matchingProduct.hbSku}, price: ${priceToUpdate}`,
          );
        } catch (error) {
          results.failed++;
          results.details.push({
            itemName: item.name,
            hbSku: item.hepsiBuradaSku,
            merchantSku: matchingProduct.merchantSku,
            status: 'failed',
            error: error.message,
          });

          this.logger.error(
            `Failed to update price for ${item.name}:`,
            error.message,
          );
        }
      }

      this.logger.log(
        `Price sync completed - Total: ${results.total}, Successful: ${results.successful}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
      );

      return results;
    } catch (error) {
      this.logger.error('Error in updateAllItemPrices:', error.message);
      throw error;
    }
  }
}
