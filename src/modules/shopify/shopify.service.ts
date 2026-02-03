import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiVersion, Session, shopifyApi } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { firstValueFrom } from 'rxjs';
import { LocationService } from '../location/location.service';
import { MenuItem } from '../menu/item.schema';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { CreateOrderDto, OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { StockHistoryStatusEnum } from './../accounting/accounting.dto';
import { AccountingService } from './../accounting/accounting.service';
import { MenuService } from './../menu/menu.service';
import { OrderCollectionStatus } from './../order/order.dto';
import { OrderService } from './../order/order.service';
import { OrderCancelReason } from './shopify.dto';

const NEORAMA_DEPO_LOCATION = 6;

interface SeenUsers {
  [key: string]: boolean;
}

interface ShopifyToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix timestamp in milliseconds
  refreshTokenExpiresAt?: number; // Unix timestamp in milliseconds
  createdAt: number;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly storeUrl: string;
  private readonly apiKey: string;
  private readonly apiSecretKey: string;
  private readonly hostUrl: string;
  private readonly apiVersion: ApiVersion = ApiVersion.January26;
  private shopifyInstance: ReturnType<typeof shopifyApi> | null = null;
  private readonly scopes: string[] = [
    'read_products',
    'write_products',
    'read_orders',
    'write_orders',
    'read_inventory',
    'write_inventory',
    'read_publications',
    'write_publications',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly httpService: HttpService,
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
    private readonly visitService: VisitService,
  ) {
    const isProduction = process.env.NODE_ENV === 'production';

    this.storeUrl = this.configService.get<string>(
      isProduction ? 'SHOPIFY_STORE_URL' : 'SHOPIFY_STAGING_STORE_URL',
    );
    this.apiKey =
      this.configService.get<string>(
        isProduction ? 'SHOPIFY_API_KEY' : 'SHOPIFY_STAGING_API_KEY',
      ) || '';
    this.apiSecretKey =
      this.configService.get<string>(
        isProduction ? 'SHOPIFY_API_SECRET' : 'SHOPIFY_STAGING_API_SECRET',
      ) || '';

    this.hostUrl =
      this.configService.get<string>(
        isProduction ? 'SHOPIFY_HOST_URL' : 'SHOPIFY_STAGING_HOST_URL',
      ) || '';

    if (!this.storeUrl) {
      this.logger.warn('Shopify store URL not configured');
    }

    this.logger.log(
      `Shopify initialized in ${
        isProduction ? 'PRODUCTION' : 'STAGING'
      } mode: ${this.storeUrl}`,
    );
  }

  private async getShopifyInstance(): Promise<ReturnType<typeof shopifyApi>> {
    if (this.shopifyInstance) {
      return this.shopifyInstance;
    }

    // Get token for adminApiAccessToken
    const accessToken = await this.getToken();

    // Initialize Shopify API client with token
    this.shopifyInstance = shopifyApi({
      apiKey: this.apiKey,
      apiSecretKey: this.apiSecretKey,
      apiVersion: this.apiVersion,
      scopes: this.scopes,
      hostName: this.hostUrl,
      isEmbeddedApp: false,
      isCustomStoreApp: true,
      adminApiAccessToken: accessToken,
    });

    return this.shopifyInstance;
  }

  private isTokenExpired(expiresAt?: number): boolean {
    if (!expiresAt) {
      return false; // Non-expiring token
    }
    const currentTime = new Date().getTime();
    // Add 5 minute buffer before expiration
    return currentTime >= expiresAt - 5 * 60 * 1000;
  }

  private async getToken(): Promise<string> {
    let shopifyToken: ShopifyToken | null = await this.redisService.get(
      RedisKeys.ShopifyToken,
    );

    // Check if token exists and is not expired
    if (shopifyToken && !this.isTokenExpired(shopifyToken.expiresAt)) {
      return shopifyToken.accessToken;
    }

    // Token expired or doesn't exist - get a new token using Client Credentials Grant
    try {
      shopifyToken = await this.getClientCredentialsToken();
      return shopifyToken.accessToken;
    } catch (error) {
      this.logError('Error getting client credentials token', error);
      throw new HttpException(
        'Shopify access token not found and unable to obtain new token. Please check configuration.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Get access token using Client Credentials Grant
   * This method is used for server-to-server integrations without user interaction
   * Token is valid for 24 hours (86399 seconds) and must be refreshed by calling this method again
   */
  private async getClientCredentialsToken(): Promise<ShopifyToken> {
    const tokenUrl = `https://${this.storeUrl}/admin/oauth/access_token`;

    if (!this.apiKey || !this.apiSecretKey) {
      throw new HttpException(
        'SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          tokenUrl,
          new URLSearchParams({
            client_id: this.apiKey,
            client_secret: this.apiSecretKey,
            grant_type: 'client_credentials',
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
          },
        ),
      );

      const tokenData: ShopifyToken = {
        accessToken: response.data.access_token,
        // Client Credentials Grant does not provide refresh tokens
        refreshToken: undefined,
        expiresAt: response.data.expires_in
          ? new Date().getTime() + response.data.expires_in * 1000
          : undefined,
        refreshTokenExpiresAt: undefined,
        createdAt: new Date().getTime(),
      };

      await this.resetShopifyToken(tokenData);
      return tokenData;
    } catch (error) {
      this.logError('Error getting client credentials token', error);
      throw new HttpException(
        'Unable to get access token using client credentials grant',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async exchangeAuthorizationCode(code: string): Promise<ShopifyToken> {
    const tokenUrl = `https://${this.storeUrl}/admin/oauth/access_token`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          tokenUrl,
          new URLSearchParams({
            client_id: this.apiKey,
            client_secret: this.apiSecretKey,
            code: code,
            expiring: '1', // Request expiring offline token
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const tokenData: ShopifyToken = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: response.data.expires_in
          ? new Date().getTime() + response.data.expires_in * 1000
          : undefined,
        refreshTokenExpiresAt: response.data.refresh_token_expires_in
          ? new Date().getTime() + response.data.refresh_token_expires_in * 1000
          : undefined,
        createdAt: new Date().getTime(),
      };

      await this.resetShopifyToken(tokenData);
      return tokenData;
    } catch (error) {
      this.logError('Error exchanging authorization code', error);
      throw new HttpException(
        'Unable to exchange authorization code for access token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const scopes = this.scopes.join(',');
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: scopes,
      redirect_uri: redirectUri,
      'granted_options[]': 'per-user',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://${
      this.storeUrl
    }/admin/oauth/authorize?${params.toString()}`;
  }

  private async getSession(): Promise<Session> {
    const accessToken = await this.getToken();

    return new Session({
      id: `${this.storeUrl}_session`,
      shop: this.storeUrl || '',
      accessToken: accessToken,
      state: 'state',
      isOnline: false,
    });
  }

  private async getGraphQLClient() {
    const shopify = await this.getShopifyInstance();
    const session = await this.getSession();
    return new shopify.clients.Graphql({ session });
  }

  /**
   * Format Shopify ID to GID format if not already formatted
   */
  private formatShopifyId(
    type: 'Product' | 'ProductVariant' | 'Location' | 'Collection',
    id: string,
  ): string {
    if (id.includes('gid://')) {
      return id;
    }
    return `gid://shopify/${type}/${id}`;
  }

  /**
   * Handle GraphQL response errors
   */
  private handleGraphQLErrors(response: any, userErrorsPath?: string): void {
    const userErrors = userErrorsPath
      ? userErrorsPath
          .split('.')
          .reduce((current, prop) => current?.[prop], response)
      : null;
    const hasErrors =
      response.errors ||
      (userErrors && Array.isArray(userErrors) && userErrors.length > 0);

    if (hasErrors) {
      const errors = response.errors || userErrors;
      throw new HttpException(
        `Shopify API error: ${JSON.stringify(errors)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reset Shopify token and instance
   */
  private async resetShopifyToken(tokenData: ShopifyToken): Promise<void> {
    await this.redisService.set(RedisKeys.ShopifyToken, tokenData);
    this.shopifyInstance = null;
  }

  /**
   * Log error with consistent format
   */
  private logError(context: string, error: any): void {
    this.logger.error(
      context,
      JSON.stringify(error.response?.data || error.message || error, null, 2),
    );
  }

  /**
   * Sleep/delay helper function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute GraphQL request with automatic token refresh on 401 errors
   * and rate limit handling with exponential backoff
   * @param requestFn Function that executes the GraphQL request
   * @param maxRetries Maximum number of retries for rate limiting (default: 3)
   * @returns Promise with the GraphQL response
   */
  private async executeGraphQLRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const response = await requestFn();
        return response;
      } catch (error: any) {
        // Check if it's a 401 Unauthorized error
        if (error?.response?.code === 401) {
          this.logger.warn(
            'Received 401 error, refreshing token and retrying request',
          );
          // Clear the token and shopify instance to force refresh
          await this.redisService.reset(RedisKeys.ShopifyToken);
          this.shopifyInstance = null;

          // Get new token
          await this.getToken();

          // Retry the request once after token refresh
          try {
            return await requestFn();
          } catch (retryError: any) {
            // If retry after token refresh fails, check if it's a throttling error
            // If so, continue with exponential backoff instead of throwing immediately
            const isThrottledAfterRefresh =
              retryError?.response?.code === 429 ||
              retryError?.message?.toLowerCase().includes('throttled') ||
              retryError?.status === 429 ||
              retryError?.statusCode === 429;

            if (isThrottledAfterRefresh && retryCount < maxRetries) {
              this.logger.warn(
                'Request failed after token refresh due to rate limiting, applying exponential backoff',
              );
              // Fall through to throttling handling below
              error = retryError;
            } else {
              // If it's not a throttling error or max retries reached, throw
              this.logger.error(
                'Request failed again after token refresh',
                retryError,
              );
              throw retryError;
            }
          }
        }

        // Check if it's a rate limit / throttling error
        const isThrottled = error?.message?.toLowerCase().includes('throttled');

        if (isThrottled && retryCount < maxRetries) {
          // Calculate exponential backoff: 2^retryCount seconds
          const backoffMs = Math.pow(2, retryCount) * 1000;
          // Add some jitter to avoid thundering herd
          const jitter = Math.random() * 1000;
          const waitTime = backoffMs + jitter;

          this.logger.warn(
            `Rate limited. Retrying in ${Math.round(waitTime)}ms (attempt ${
              retryCount + 1
            }/${maxRetries})`,
          );

          await this.sleep(waitTime);
          retryCount++;
          continue;
        }

        // If not a retryable error or max retries reached, throw the original error
        throw error;
      }
    }

    throw new Error('Max retries exceeded for GraphQL request');
  }

  async getAllProducts() {
    const allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 50, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                description
                handle
                status
                productType
                vendor
                tags
                createdAt
                updatedAt
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
                      barcode
                      inventoryQuantity
                      image {
                        url
                      }
                      inventoryItem {
                        id
                        tracked
                        inventoryLevels(first: 10) {
                          edges {
                            node {
                              id
                              quantities(names: ["available", "on_hand"]) {
                                name
                                quantity
                              }
                              location {
                                id
                                name
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                images(first: 10) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      `;

      try {
        const response = await this.executeGraphQLRequest(async () => {
          const client = await this.getGraphQLClient();
          return await client.request(query, {
            variables: cursor ? { cursor } : {},
          });
        });

        this.handleGraphQLErrors(response);

        const products = response.data.products.edges.map(
          (edge: any) => edge.node,
        );
        allProducts.push(...products);

        hasNextPage = response.data.products.pageInfo.hasNextPage;
        cursor = response.data.products.pageInfo.endCursor;
      } catch (error) {
        this.logError('Error fetching products', error);
        throw new HttpException(
          'Unable to fetch products from Shopify.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    return allProducts;
  }

  async getProductById(productId: string) {
    // Ensure productId is in the correct format
    const formattedProductId = this.formatShopifyId('Product', productId);

    const query = `
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(query, {
          variables: { id: formattedProductId },
        });
      });

      this.handleGraphQLErrors(response);

      return response.data.product;
    } catch (error) {
      this.logError('Error fetching product by ID', error);
      throw new HttpException(
        `Unable to fetch product ${productId} from Shopify.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllOrders() {
    const allOrders: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = `
        query GetOrders($cursor: String) {
          orders(first: 50, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                email
                createdAt
                updatedAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variant {
                        id
                        product {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      try {
        const response = await this.executeGraphQLRequest(async () => {
          const client = await this.getGraphQLClient();
          return await client.request(query, {
            variables: cursor ? { cursor } : {},
          });
        });

        this.handleGraphQLErrors(response);

        const orders = response.data.orders.edges.map((edge: any) => edge.node);
        allOrders.push(...orders);

        hasNextPage = response.data.orders.pageInfo.hasNextPage;
        cursor = response.data.orders.pageInfo.endCursor;
      } catch (error) {
        this.logError('Error fetching orders', error);
        throw new HttpException(
          'Unable to fetch orders from Shopify.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    return allOrders;
  }

  async getAllCollections() {
    const query = `
      query GetCollections {
        collections(first: 250) {
          edges {
            node {
              id
              title
              handle
              description
              updatedAt
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(query);
      });

      this.handleGraphQLErrors(response);

      return response.data.collections.edges.map((edge: any) => edge.node);
    } catch (error) {
      this.logError('Error fetching collections', error);
      throw new HttpException(
        'Unable to fetch collections from Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllLocations() {
    const query = `
      query GetLocations {
        locations(first: 250) {
          edges {
            node {
              id
              name
              address {
                address1
                address2
                city
                province
                country
                zip
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(query);
      });

      this.handleGraphQLErrors(response);

      return response.data.locations.edges.map((edge: any) => edge.node);
    } catch (error) {
      this.logError('Error fetching locations', error);
      throw new HttpException(
        'Unable to fetch locations from Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllPublications() {
    const query = `
      query GetPublications {
        publications(first: 250) {
          edges {
            node {
              id
              name
              supportsFuturePublishing
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(query);
      });

      this.handleGraphQLErrors(response);

      return response.data.publications.edges.map((edge: any) => edge.node);
    } catch (error) {
      this.logError('Error fetching publications', error);
      throw new HttpException(
        'Unable to fetch publications from Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getOnlineStorePublicationId(): Promise<string | null> {
    try {
      const publications = await this.getAllPublications();
      // Online Store genellikle "Online Store" veya benzer bir isimde olur
      const onlineStore = publications.find(
        (pub: any) =>
          pub.name?.toLowerCase().includes('online store') ||
          pub.name?.toLowerCase().includes('online-store'),
      );

      if (onlineStore) {
        this.logger.log(
          `Found Online Store publication with ID: ${onlineStore.id}`,
        );
        return onlineStore.id;
      }

      this.logger.warn('Online Store publication not found');
      return null;
    } catch (error) {
      this.logError('Error getting Online Store publication ID', error);
      return null;
    }
  }

  async getAllPublicationIdsExceptPOS(): Promise<string[]> {
    try {
      const publications = await this.getAllPublications();
      // POS (Point of Sale) dışındaki tüm kanalları al
      const nonPOSPublications = publications.filter(
        (pub: any) =>
          !pub.name?.toLowerCase().includes('point of sale') &&
          !pub.name?.toLowerCase().includes('pos'),
      );

      const publicationIds = nonPOSPublications.map((pub: any) => pub.id);

      this.logger.log(
        `Found ${publicationIds.length} non-POS publications:`,
        nonPOSPublications.map((pub: any) => pub.name).join(', '),
      );

      return publicationIds;
    } catch (error) {
      this.logError('Error getting non-POS publication IDs', error);
      return [];
    }
  }

  async publishProductToOnlineStore(productId: string): Promise<boolean> {
    try {
      const publicationIds = await this.getAllPublicationIdsExceptPOS();

      if (publicationIds.length === 0) {
        this.logger.warn(
          'Cannot publish product: No publications found (excluding POS)',
        );
        return false;
      }

      const formattedProductId = this.formatShopifyId('Product', productId);

      const mutation = `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              availablePublicationsCount {
                count
              }
              resourcePublicationsCount {
                count
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            id: formattedProductId,
            input: publicationIds.map((publicationId) => ({ publicationId })),
          },
        });
      });

      this.handleGraphQLErrors(response, 'data.publishablePublish.userErrors');

      this.logger.log(
        `Product ${productId} successfully published to ${publicationIds.length} channels (excluding POS)`,
      );
      return true;
    } catch (error) {
      this.logError('Error publishing product to channels', error);
      return false;
    }
  }

  async createItemProduct(
    user: User,
    item: MenuItem,
    shopifyCollectionIds?: string[],
  ) {
    try {
      const createShopifyProductItem = {
        title: item.name,
        descriptionHtml: item.description?.trim() || '-',
        productType: 'Physical',
        variants: [
          {
            price: item.price.toString(),
            inventoryManagement: 'SHOPIFY',
            inventoryPolicy: 'DENY',
          },
        ],
        images: [
          ...(item.imageUrl ? [{ src: item.imageUrl }] : []),
          ...(Array.isArray(item.productImages)
            ? item.productImages.map((url) => ({ src: url }))
            : []),
        ],
      };
      const shopifyProduct = await this.createProduct(
        createShopifyProductItem,
        shopifyCollectionIds,
      );
      if (shopifyProduct) {
        const productId = shopifyProduct.id.split('/').pop();
        const updatedItem = { ...item.toObject(), shopifyId: productId };
        await this.menuService.updateItem(user, item._id, updatedItem);

        // Stok takibini shopify arayüzünden elle açmamak için burada ürünün stok takibini açarak yolluyoruz.
        if (shopifyProduct.variants?.edges?.[0]?.node?.id) {
          const variantId = shopifyProduct.variants.edges[0].node.id;
          await this.enableInventoryTracking(variantId);
        }

        const productStock = await this.accountingService.findProductStock(
          item.matchedProduct,
        );
        const storeStock = productStock.find((stock) => stock.location === 6);
        if (storeStock && shopifyProduct.variants?.edges?.[0]?.node?.id) {
          const variantId = shopifyProduct.variants.edges[0].node.id
            .split('/')
            .pop();
          await this.updateProductStock(variantId, 6, storeStock.quantity);
        }
      }
    } catch (error) {
      this.logError('Failed to create item product', error);
      throw new HttpException(
        'Failed to process item product due to an error.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createProduct(productInput: any, collectionIds?: string[]) {
    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            descriptionHtml
            productType
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  sku
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // Build input without variants and images in ProductInput
      const input: any = {
        title: productInput.title,
        descriptionHtml: productInput.descriptionHtml,
        productType: productInput.productType,
      };

      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: { input },
        });
      });

      this.handleGraphQLErrors(response, 'data.productCreate.userErrors');

      const product = response.data.productCreate.product;

      // Update variant price if provided
      if (
        productInput.variants?.[0]?.price &&
        product.variants?.edges?.[0]?.node?.id
      ) {
        const variantId = product.variants.edges[0].node.id;
        await this.updateProductPrice(
          product.id.split('/').pop(),
          variantId,
          parseFloat(productInput.variants[0].price),
        );
      }

      // Add images if provided
      if (productInput.images?.length > 0 && product.id) {
        const productId = product.id.split('/').pop();
        const imageUrls = productInput.images.map((img: any) => img.src);
        await this.createProductImages(productId, imageUrls);
      }

      // Add product to collections if provided
      if (collectionIds?.length > 0 && product.id) {
        const productId = product.id.split('/').pop();
        for (const collectionId of collectionIds) {
          await this.addProductToCollection(collectionId, productId);
        }
      }

      // Publish product to Online Store
      if (product.id) {
        const productId = product.id.split('/').pop();
        await this.publishProductToOnlineStore(productId);
      }

      return product;
    } catch (error) {
      this.logError('Error creating product', error);
      throw new HttpException(
        'Unable to create product in Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async enableInventoryTracking(variantId: string): Promise<boolean> {
    // Get inventoryItemId from variant
    const variantQuery = `
      query GetVariant($id: ID!) {
        productVariant(id: $id) {
          id
          inventoryItem {
            id
            tracked
          }
        }
      }
    `;

    try {
      const variantResponse = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(variantQuery, {
          variables: {
            id: this.formatShopifyId('ProductVariant', variantId),
          },
        });
      });

      if (!variantResponse.data.productVariant) {
        this.handleGraphQLErrors(variantResponse);
      }

      const inventoryItem = variantResponse.data.productVariant.inventoryItem;

      // Skip if already tracked
      if (inventoryItem.tracked) {
        console.log('Inventory tracking is already enabled');
        return true;
      }

      // Enable tracking
      const mutation = `
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem {
              id
              tracked
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const updateResponse = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            id: inventoryItem.id,
            input: {
              tracked: true,
            },
          },
        });
      });

      this.handleGraphQLErrors(
        updateResponse,
        'data.inventoryItemUpdate.userErrors',
      );
      console.log('Inventory tracking enabled successfully');
      return true;
    } catch (error) {
      this.logError('Error enabling inventory tracking', error);
      return false;
    }
  }

  async updateProductStock(
    variantId: string,
    stockLocationId: number,
    stockCount: number,
    isInvalidateProductCache = true,
  ): Promise<boolean> {
    if (!variantId) {
      this.logError('variantId is required for Shopify stock update', {
        variantId,
        stockLocationId,
        stockCount,
      });
      return false;
    }

    const foundLocation = await this.locationService.findLocationById(
      stockLocationId,
    );
    if (!foundLocation.shopifyId) {
      this.logger.log(
        `Stock Location with ID ${stockLocationId} does not have shopify id`,
      );
      return;
    }

    const locationId = foundLocation.shopifyId;

    // First, get the inventoryItemId from the variant
    const variantQuery = `
      query GetVariant($id: ID!) {
        productVariant(id: $id) {
          id
          inventoryItem {
            id
          }
        }
      }
    `;

    let inventoryItemId: string;
    try {
      const variantResponse = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(variantQuery, {
          variables: {
            id: this.formatShopifyId('ProductVariant', variantId),
          },
        });
      });

      if (!variantResponse.data.productVariant) {
        this.handleGraphQLErrors(variantResponse);
      }

      inventoryItemId = variantResponse.data.productVariant.inventoryItem.id;
    } catch (error) {
      this.logError('Error fetching variant', error);
      // Don't throw exception, just log the error
      // This allows the main flow to continue even if Shopify update fails
      return false;
    }

    const mutation = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            input: {
              reason: 'correction',
              setQuantities: [
                {
                  inventoryItemId: inventoryItemId,
                  locationId: this.formatShopifyId('Location', locationId),
                  quantity: stockCount,
                },
              ],
            },
          },
        });
      });

      try {
        this.handleGraphQLErrors(
          response,
          'data.inventorySetOnHandQuantities.userErrors',
        );
      } catch (error) {
        this.logError('Failed to update stock', error);
        return false;
      }

      this.logger.log('Stock updated successfully.');
      if (isInvalidateProductCache) {
        await this.websocketGateway.emitShopifyProductStockChanged();
      }

      return true;
    } catch (error) {
      this.logError('Error updating stock', error);
      // Don't throw exception, just log the error
      // This allows the main flow to continue even if Shopify update fails
      return false;
    }
  }

  async updateProductImages(itemId: number): Promise<void> {
    const item = await this.menuService.findItemById(itemId);
    if (!item) {
      throw new HttpException(
        `Menu item with ID ${itemId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (!item.shopifyId) {
      throw new HttpException(
        `Menu item with ID ${itemId} does not have a Shopify ID`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const urls: string[] = [];
    if (item.imageUrl) {
      urls.push(item.imageUrl);
    }
    item.productImages?.forEach((url) => urls.push(url));

    const productId = this.formatShopifyId('Product', item.shopifyId);
    const product = await this.getProductById(productId);
    if (!product) {
      throw new HttpException(
        `Shopify product not found for ID ${item.shopifyId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      await this.createProductImages(item.shopifyId, urls);
      this.logger.log(
        `Successfully updated images for product ${item.shopifyId}`,
      );
    } catch (err) {
      this.logError(`Failed to push images for product ${item.shopifyId}`, err);
      throw new HttpException(
        'Unable to upload product images.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductPrice(
    productId: string,
    variantId: string,
    newPrice: number,
  ): Promise<boolean> {
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const formattedProductId = this.formatShopifyId('Product', productId);
      const formattedVariantId = this.formatShopifyId(
        'ProductVariant',
        variantId,
      );

      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            productId: formattedProductId,
            variants: [
              {
                id: formattedVariantId,
                price: newPrice.toString(),
              },
            ],
          },
        });
      });

      try {
        this.handleGraphQLErrors(
          response,
          'data.productVariantsBulkUpdate.userErrors',
        );
      } catch (error) {
        this.logError('Failed to update price', error);
        return false;
      }

      this.logger.log(`Shopify ${productId} price updated successfully.`);
      await this.websocketGateway.emitShopifyProductStockChanged();
      return true;
    } catch (error) {
      this.logError('Error updating price', error);
      throw new HttpException(
        'Unable to update product price.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }

  async bulkUpdatePricesForProducts(
    items: Array<{
      productId: string;
      variantId: string;
      price: number | string;
    }>,
  ): Promise<void> {
    // if (process.env.NODE_ENV !== 'production') return;

    if (items.length === 0) {
      this.logger.log('No products to update');
      return;
    }

    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Group items by productId since each mutation updates variants for a single product
    const productMap = new Map<
      string,
      Array<{ variantId: string; price: number }>
    >();

    // Track variant IDs that need to be saved to DB (productId -> variantId mapping)
    const variantIdsToSave = new Map<string, string>();

    // First, get all products to fetch variant IDs if needed
    const allProducts = await this.getAllProducts();
    const productCache = new Map<string, any>();
    allProducts.forEach((product) => {
      const productId = product.id.split('/').pop();
      if (productId) {
        productCache.set(productId, product);
      }
    });

    let skippedCount = 0;
    for (const item of items) {
      if (!item.productId || item.price == null) {
        continue;
      }

      const price = Number(item.price);
      if (isNaN(price)) {
        this.logger.warn(
          `Invalid price for product ${item.productId}: ${item.price}`,
        );
        continue;
      }

      // If variantId is not provided, get the first variant from the product
      let variantId = item.variantId;
      const product = productCache.get(item.productId);

      if (!variantId) {
        if (product?.variants?.edges?.[0]?.node?.id) {
          variantId = product.variants.edges[0].node.id.split('/').pop();
          // Track this variantId to save to DB later
          variantIdsToSave.set(item.productId, variantId);
        } else {
          this.logger.warn(
            `No variant found for product ${item.productId}, skipping`,
          );
          continue;
        }
      }

      // Check if price needs to be updated by comparing with current Shopify price
      if (product?.variants?.edges) {
        const variant = product.variants.edges.find(
          (v: any) => v.node.id.split('/').pop() === variantId,
        );

        if (variant?.node?.price) {
          const currentPrice = parseFloat(variant.node.price);
          // Compare prices with small tolerance for floating point comparison
          if (Math.abs(currentPrice - price) < 0.01) {
            // Price is the same (or very close), skip update
            skippedCount++;
            this.logger.debug(
              `Price unchanged for product ${item.productId} (${currentPrice} = ${price}), skipping update`,
            );
            continue;
          }
        }
      }

      if (!productMap.has(item.productId)) {
        productMap.set(item.productId, []);
      }
      productMap.get(item.productId)!.push({
        variantId: variantId!,
        price,
      });
    }

    if (skippedCount > 0) {
      this.logger.log(`Skipped ${skippedCount} products with unchanged prices`);
    }

    // Process in batches to avoid overwhelming the API
    // Reduced batch size and added sequential processing with delays to avoid rate limiting
    const batchSize = 50;
    const productEntries = Array.from(productMap.entries());
    const batches = this.chunk(productEntries, batchSize);

    this.logger.log(
      `Updating prices for ${productEntries.length} products in ${batches.length} batches (${batchSize} per batch)`,
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Process products sequentially within each batch to avoid rate limiting
      for (let i = 0; i < batch.length; i++) {
        const [productId, variants] = batch[i];
        try {
          const formattedProductId = this.formatShopifyId('Product', productId);
          const formattedVariants = variants.map((v) => ({
            id: this.formatShopifyId('ProductVariant', v.variantId),
            price: v.price.toString(),
          }));

          const response = await this.executeGraphQLRequest(
            async () => {
              const client = await this.getGraphQLClient();
              return await client.request(mutation, {
                variables: {
                  productId: formattedProductId,
                  variants: formattedVariants,
                },
              });
            },
            3, // max retries for rate limiting
          );

          try {
            this.handleGraphQLErrors(
              response,
              'data.productVariantsBulkUpdate.userErrors',
            );
            this.logger.debug(
              `Updated price for product ${productId} with ${variants.length} variant(s)`,
            );
          } catch (error) {
            this.logError(
              `Failed to update price for product ${productId}`,
              error,
            );
          }
        } catch (error) {
          this.logError(`Error updating price for product ${productId}`, error);
        }
      }

      this.logger.log(`Batch ${batchIndex + 1}/${batches.length} completed`);
    }

    this.logger.log('Bulk price update completed');

    // Save variant IDs to DB if any were found (bulk update)
    if (variantIdsToSave.size > 0) {
      try {
        await this.menuService.bulkUpdateShopifyVariantIds(variantIdsToSave);
        this.logger.log(
          `Saved ${variantIdsToSave.size} variant IDs to database`,
        );
      } catch (error) {
        this.logError('Error saving variant IDs to database', error);
        // Don't throw, just log the error - price updates were successful
      }
    }
    // TODO maybe we should emit price changed event instead of stock changed event
    await this.websocketGateway.emitShopifyProductStockChanged();
  }

  async createProductImages(productId: string, imageArray: string[]) {
    for (let i = 0; i < imageArray.length; i++) {
      const mutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              id
              ... on MediaImage {
                image {
                  url
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      try {
        const response = await this.executeGraphQLRequest(async () => {
          const client = await this.getGraphQLClient();
          return await client.request(mutation, {
            variables: {
              productId: this.formatShopifyId('Product', productId),
              media: [
                {
                  originalSource: imageArray[i],
                  mediaContentType: 'IMAGE',
                },
              ],
            },
          });
        });

        this.handleGraphQLErrors(
          response,
          'data.productCreateMedia.userErrors',
        );
        this.logger.log(`Image ${i + 1} uploaded successfully`);
      } catch (error) {
        this.logError(`Error uploading image ${i + 1}`, error);
        throw new HttpException(
          `Unable to upload image ${i + 1} to Shopify.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async addProductToCollection(collectionId: string, productId: string) {
    const mutation = `
      mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          collection {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            id: this.formatShopifyId('Collection', collectionId),
            productIds: [this.formatShopifyId('Product', productId)],
          },
        });
      });

      this.handleGraphQLErrors(
        response,
        'data.collectionAddProducts.userErrors',
      );
      this.logger.log(
        `Product ${productId} added to collection ${collectionId} successfully`,
      );
    } catch (error) {
      this.logError(
        `Error adding product to collection ${collectionId}`,
        error,
      );
      throw new HttpException(
        `Unable to add product to collection ${collectionId}.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async orderCreateWebHook(data?: any) {
    this.logger.log('Processing Shopify order webhook...');
    this.logger.debug('Webhook data:', data);
    try {
      if (!data) {
        throw new HttpException(
          'Invalid request: Missing data',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log('Received Shopify order webhook data:', data);

      const lineItems = data?.line_items ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv');

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (lineItems.length === 0) {
        this.logger.log('No line items to process');
        return;
      }

      if (
        data?.financial_status !== 'paid' &&
        data?.financial_status !== 'pending'
      ) {
        this.logger.log(
          `Skipping order as financial status is not 'paid' or 'pending'`,
        );
        return;
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
            quantity,
            variant_id,
            product_id,
            price,
          } = lineItem;

          if (!product_id || !quantity) {
            throw new HttpException(
              'Invalid line item data',
              HttpStatus.BAD_REQUEST,
            );
          }

          const foundMenuItem = await this.menuService.findByShopifyId(
            product_id.toString(),
          );
          if (!foundMenuItem?.matchedProduct) {
            this.logger.log(`Menu item not found for productId: ${product_id}`);
            continue;
          }
          const foundPaymentMethod =
            await this.accountingService.findPaymentMethodByShopifyId(
              data?.payment_gateway_names?.[0],
            );

          // Check if this specific line item order already exists
          const foundShopifyOrder =
            await this.orderService.findByShopifyOrderLineItemId(
              lineItemId?.toString(),
            );
          if (foundShopifyOrder) {
            this.logger.log(
              `Order already exists for shopify line item id: ${lineItemId}, skipping to next item.`,
            );
            continue;
          }

          const shopifyOrderNumber = data?.order_number;
          let createOrderObject: CreateOrderDto = {
            item: foundMenuItem._id,
            quantity: quantity,
            note: '',
            discount: undefined,
            discountNote: '',
            isOnlinePrice: false,
            location: 4,
            unitPrice: parseFloat(price),
            paidQuantity: quantity,
            status: OrderStatus.AUTOSERVED,
            stockLocation: 6, //TO-DO BURAYA 1444. SATIRDAKI BLOKTAN LOKASYON ID'SINI ALAMADIGIMIZ ICIN 6 GIRDIK, DAHA SONRA DUZELTILECEK
            createdAt: new Date(data?.created_at || new Date()),
            tableDate: new Date(),
            createdBy: constantUser?._id,
            stockNote: StockHistoryStatusEnum.SHOPIFYORDERCREATE,
            shopifyOrderId: data?.id?.toString(),
            shopifyOrderLineItemId: lineItemId?.toString(),
            paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
            ...(shopifyOrderNumber && {
              shopifyOrderNumber: shopifyOrderNumber.toString(),
            }),
          };

          // Shipping adddress bossa magazadan teslim siparis demek, sadece magazadan teslim siparislerde musteri bilgilerini cekiyoruz.
          if (!data?.shipping_address) {
            createOrderObject = {
              ...createOrderObject,
              shopifyCustomer: {
                id: data?.customer?.id?.toString(),
                firstName: data?.customer?.first_name,
                lastName: data?.customer?.last_name,
                email: data?.customer?.email,
                phone: data?.customer?.phone,
                location: 6,
              },
            };
          }

          try {
            const order = await this.orderService.createOrder(
              constantUser,
              createOrderObject,
            );
            this.logger.log('Order created:', order);

            const itemAmount = parseFloat(price) * quantity;
            createdOrders.push({
              order: order._id,
              paidQuantity: quantity,
              amount: itemAmount,
              menuItemName: foundMenuItem.name,
            });
            totalAmount += itemAmount;
          } catch (orderError) {
            this.logError('Error creating order', orderError);
          }
        } catch (itemError) {
          this.logError('Error processing line item', itemError);
        }
      }

      // Create a single collection for all orders from this Shopify order
      if (createdOrders.length > 0) {
        const foundPaymentMethod =
          await this.accountingService.findPaymentMethodByShopifyId(
            data?.payment_gateway_names?.[0],
          );
        const shopifyOrderNumber = data?.order_number;
        const shippingAmount = data?.total_shipping_price_set?.shop_money
          ?.amount
          ? parseFloat(data.total_shipping_price_set.shop_money.amount)
          : 0;

        const createdCollection = {
          location: 4,
          paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
          amount: totalAmount,
          status: OrderCollectionStatus.PAID,
          orders: createdOrders.map(({ order, paidQuantity }) => ({
            order,
            paidQuantity,
          })),
          createdBy: constantUser._id,
          tableDate: new Date(),
          shopifyId: data?.id?.toString(),
          ...(shopifyOrderNumber && {
            shopifyOrderNumber: shopifyOrderNumber.toString(),
          }),
          ...(shippingAmount > 0 && {
            shopifyShippingAmount: shippingAmount,
          }),
        };

        try {
          const collection = await this.orderService.createCollection(
            constantUser,
            createdCollection,
          );
          this.logger.log('Collection created:', collection);

          // Sadece gel-al (mağazadan teslim) siparişleri için collection bildirimi
          // shipping_address YOKSA = gel-al, VARSA = kargo
          if (!data?.shipping_address) {
            const notificationEvents =
              await this.notificationService.findAllEventNotifications();

            const shopifyTakeawayEvent = notificationEvents.find(
              (notification) =>
                notification.event === NotificationEventType.SHOPIFYTAKEAWAY,
            );

            if (shopifyTakeawayEvent) {
              const orderNumber = shopifyOrderNumber || data?.name || 'N/A';

              const productNames = createdOrders.map(
                ({ menuItemName }) => menuItemName || 'Bilinmeyen Ürün',
              );

              const message = {
                key: 'ShopifyOrderReceived',
                params: {
                  orderNumber: orderNumber.toString(),
                  amount: totalAmount.toFixed(2),
                  itemCount: createdOrders.length,
                  products: productNames.join(', '),
                },
              };

              await this.notificationService.createNotification({
                type: shopifyTakeawayEvent.type,
                createdBy: shopifyTakeawayEvent.createdBy,
                selectedUsers: shopifyTakeawayEvent.selectedUsers,
                selectedRoles: shopifyTakeawayEvent.selectedRoles,
                selectedLocations: shopifyTakeawayEvent.selectedLocations,
                seenBy: [],
                event: NotificationEventType.SHOPIFYTAKEAWAY,
                message,
              });
            }
          }
        } catch (collectionError) {
          this.logError('Error creating collection', collectionError);
        }
      }
    } catch (error) {
      this.logError('Error in orderCreateWebHook', error);
      throw new HttpException(
        `Error processing webhook: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async orderCancelWebHook(data?: any) {
    try {
      if (!data) {
        throw new HttpException(
          'Invalid request: Missing data',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        'Received Shopify cancel webhook data:',
        JSON.stringify(data, null, 2),
      );

      const refunds = data?.refunds ?? [];
      this.logger.log(`Processing ${refunds.length} refund(s)`);
      this.logger.log('Refunds data:', JSON.stringify(refunds, null, 2));

      const constantUser = await this.userService.findByIdWithoutPopulate('dv');

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (refunds.length === 0) {
        this.logger.log('No refunds to process - exiting');
        return;
      }

      this.logger.log(
        `Financial status: ${data?.financial_status}, Cancelled at: ${data?.cancelled_at}`,
      );

      if (
        data?.financial_status !== 'refunded' &&
        data?.cancelled_at === null
      ) {
        this.logger.log(
          `Skipping order as status is not 'refunded' or cancelled`,
        );
        return;
      }

      // Collect all cancellation info first
      const cancellationResults: Array<{
        order: any;
        collection: any;
        cancelledAmount: number;
        isPartial: boolean;
        remainingQuantity: number;
        cancelledOrder: any;
      }> = [];

      // Process each refund and its refund_line_items
      for (let i = 0; i < refunds.length; i++) {
        const refund = refunds[i];
        this.logger.log(
          `Processing refund ${i + 1}/${refunds.length}:`,
          JSON.stringify(refund, null, 2),
        );

        const refundLineItems = refund?.refund_line_items ?? [];
        this.logger.log(
          `Refund ${i + 1} has ${refundLineItems.length} line item(s)`,
        );

        if (refundLineItems.length === 0) {
          this.logger.log(`No refund line items in refund ${i + 1} - skipping`);
          continue;
        }

        for (let j = 0; j < refundLineItems.length; j++) {
          const refundLineItem = refundLineItems[j];
          this.logger.log(
            `Processing refund line item ${j + 1}/${refundLineItems.length}:`,
            JSON.stringify(refundLineItem, null, 2),
          );

          try {
            const lineItemId = refundLineItem?.line_item_id?.toString();
            const quantity = refundLineItem?.quantity ?? 0;

            this.logger.log(
              `Line item ID: ${lineItemId}, Quantity to refund: ${quantity}`,
            );

            if (!lineItemId) {
              this.logger.warn(
                'Invalid refund line item data: missing line_item_id',
                JSON.stringify(refundLineItem),
              );
              continue;
            }

            if (quantity <= 0) {
              this.logger.warn(
                `Invalid quantity for line item ${lineItemId}: ${quantity}`,
              );
              continue;
            }

            this.logger.log(
              `Calling cancelShopifyOrder for line item ${lineItemId} with quantity ${quantity}`,
            );

            const cancellationResult =
              await this.orderService.cancelShopifyOrder(
                constantUser,
                lineItemId,
                quantity,
              );

            this.logger.log(
              `Cancellation result for line item ${lineItemId}:`,
              JSON.stringify(cancellationResult, null, 2),
            );

            if (cancellationResult) {
              cancellationResults.push(cancellationResult);
              this.logger.log(
                `Added cancellation result. Total results: ${cancellationResults.length}`,
              );
            } else {
              this.logger.warn(
                `No cancellation result returned for line item ${lineItemId}`,
              );
            }
          } catch (itemError) {
            this.logger.error(
              `Error processing refund line item ${j + 1}:`,
              itemError,
            );
            this.logError('Error processing refund line item', itemError);
          }
        }
      }

      this.logger.log(
        `Total cancellation results collected: ${cancellationResults.length}`,
      );
      this.logger.log(
        'All cancellation results:',
        JSON.stringify(cancellationResults, null, 2),
      );

      // Group cancellations by collection and update collections
      const collectionMap = new Map();
      this.logger.log('Starting to group cancellations by collection');

      for (let i = 0; i < cancellationResults.length; i++) {
        const result = cancellationResults[i];
        const collectionId = result.collection._id.toString();
        this.logger.log(
          `Processing cancellation result ${i + 1}/${
            cancellationResults.length
          } for collection ${collectionId}`,
        );

        if (!collectionMap.has(collectionId)) {
          this.logger.log(`Creating new collection entry for ${collectionId}`);
          collectionMap.set(collectionId, {
            collection: result.collection,
            cancellations: [],
            totalCancelledAmount: 0,
          });
        }

        const collectionData = collectionMap.get(collectionId);
        collectionData.cancellations.push(result);
        collectionData.totalCancelledAmount += result.cancelledAmount;
        this.logger.log(
          `Collection ${collectionId} now has ${collectionData.cancellations.length} cancellation(s), total cancelled amount: ${collectionData.totalCancelledAmount}`,
        );
      }

      this.logger.log(`Grouped into ${collectionMap.size} collection(s)`);

      // Update each collection once
      let collectionIndex = 0;
      for (const [collectionId, collectionData] of collectionMap.entries()) {
        collectionIndex++;
        this.logger.log(
          `Updating collection ${collectionIndex}/${collectionMap.size} (ID: ${collectionId})`,
        );

        try {
          const { collection, cancellations, totalCancelledAmount } =
            collectionData;

          this.logger.log(
            `Collection current amount: ${collection.amount}, total cancelled amount: ${totalCancelledAmount}`,
          );
          this.logger.log(
            `Collection has ${collection.orders.length} order(s)`,
          );

          // Build updated orders array
          const orderUpdateMap = new Map();

          // Initialize with existing orders
          for (const orderItem of collection.orders) {
            orderUpdateMap.set(orderItem.order.toString(), {
              order: orderItem.order,
              paidQuantity: orderItem.paidQuantity,
            });
          }
          this.logger.log(
            `Initialized order map with ${orderUpdateMap.size} order(s)`,
          );

          // Update based on cancellations
          for (let i = 0; i < cancellations.length; i++) {
            const cancellation = cancellations[i];
            this.logger.log(
              `Processing cancellation ${i + 1}/${
                cancellations.length
              } - isPartial: ${cancellation.isPartial}, order ID: ${
                cancellation.order._id
              }`,
            );

            if (cancellation.isPartial) {
              // Partial cancellation: update existing order's paidQuantity
              this.logger.log(
                `Partial cancellation - updating order ${cancellation.order._id} paidQuantity to ${cancellation.remainingQuantity}`,
              );
              orderUpdateMap.set(cancellation.order._id.toString(), {
                order: cancellation.order._id,
                paidQuantity: cancellation.remainingQuantity,
              });
            } else {
              // Full cancellation: remove order from collection
              this.logger.log(
                `Full cancellation - removing order ${cancellation.order._id} from collection`,
              );
              orderUpdateMap.delete(cancellation.order._id.toString());
            }
          }

          const updatedOrders = Array.from(orderUpdateMap.values());
          const newAmount = collection.amount - totalCancelledAmount;
          this.logger.log(
            `Updated orders count: ${updatedOrders.length}, new amount: ${newAmount}`,
          );

          // Check if all orders in collection are cancelled
          const allOrderIds = updatedOrders.map((o) => o.order);
          this.logger.log(
            `Checking active status for ${allOrderIds.length} order(s)`,
          );

          const activeOrders = await this.orderService.findActiveOrdersByIds(
            allOrderIds,
          );
          this.logger.log(`Found ${activeOrders.length} active order(s)`);

          const updateData: any = {
            orders: updatedOrders,
            amount: Math.max(0, newAmount), // Ensure amount doesn't go negative
          };

          // If no active orders left or amount is 0, cancel the collection
          if (activeOrders.length === 0 || newAmount <= 0) {
            this.logger.log(
              `Cancelling collection ${collectionId} - active orders: ${activeOrders.length}, new amount: ${newAmount}`,
            );
            updateData.status = OrderCollectionStatus.CANCELLED;
            updateData.cancelledAt = new Date();
            updateData.cancelledBy = constantUser._id;
          }

          this.logger.log(
            `Update data for collection ${collectionId}:`,
            JSON.stringify(updateData, null, 2),
          );

          // UpdateCollection already emits websocket events for collection
          // We only need to emit order updates here
          const allUpdatedOrders = cancellations
            .flatMap((c) =>
              c.isPartial ? [c.order, c.cancelledOrder] : [c.order],
            )
            .filter(Boolean); // Remove null/undefined values

          this.logger.log(
            `Will emit updates for ${allUpdatedOrders.length} order(s)`,
          );

          this.logger.log(
            `Calling updateCollection for collection ${collectionId}`,
          );
          await this.orderService.updateCollection(
            constantUser,
            collection._id,
            updateData,
          );
          this.logger.log(`Collection ${collectionId} updated successfully`);

          // Emit order updates separately since updateCollection might emit different orders
          if (allUpdatedOrders.length > 0) {
            this.logger.log(
              `Emitting order updates for ${allUpdatedOrders.length} order(s)`,
            );
            await this.websocketGateway.emitOrderUpdated(allUpdatedOrders);
          }
        } catch (collectionError) {
          this.logger.error(
            `Error updating collection ${collectionId}:`,
            collectionError,
          );
          this.logError('Error updating collection', collectionError);
        }
      }

      this.logger.log('orderCancelWebHook processing completed successfully');
    } catch (error) {
      this.logger.error('CRITICAL ERROR in orderCancelWebHook:', error);
      this.logger.error('Error stack:', error?.stack);
      this.logError('Error in orderCancelWebHook', error);
    }
  }

  async updateAllProductStocks() {
    try {
      const shopifyItems = await this.menuService.getAllShopifyItems();
      this.logger.log('Fetched Shopify Items:', shopifyItems);
      const shopifyProducts = await this.getAllProducts();
      this.logger.log('Fetched Shopify Products:', shopifyProducts);
      const locations = await this.locationService.findAllLocations();
      this.logger.log('Fetched Stock Locations:', locations);

      for (const item of shopifyItems) {
        try {
          const productStocks = await this.accountingService.findProductStock(
            item.matchedProduct,
          );
          this.logger.log(
            `Fetched product stocks for ${item.shopifyId}:`,
            productStocks,
          );
          for (const stock of productStocks) {
            try {
              if (!item.shopifyId) {
                this.logger.warn(
                  `Product ${item.matchedProduct} does not have a Shopify ID`,
                );
                continue;
              }

              const productId = this.formatShopifyId('Product', item.shopifyId);
              const foundShopifyProduct = shopifyProducts.find(
                (product) => product.id === productId,
              );
              if (!foundShopifyProduct) {
                this.logger.warn(
                  `Product ${item.shopifyId} not found in Shopify`,
                );
                continue;
              }

              const foundLocation = locations?.find(
                (location) => location._id === stock.location,
              );
              if (!foundLocation?.shopifyId) {
                this.logger.warn(
                  `Location ${stock.location} does not have a Shopify ID`,
                );
                continue;
              }

              const variantId =
                foundShopifyProduct.variants?.edges?.[0]?.node?.id;
              console.log('variantId', variantId);
              const currentInventoryQuantity =
                foundShopifyProduct?.variants?.edges?.[0]?.node
                  ?.inventoryQuantity;
              console.log('currentInventoryQuantity', currentInventoryQuantity);
              console.log('stock.quantity', stock.quantity);
              console.log(foundShopifyProduct.variants);
              if (variantId) {
                // Skip update if quantities are already equal
                if (currentInventoryQuantity === stock.quantity) {
                  this.logger.log(
                    `Stock already up to date for product ${item.shopifyId}, location ${stock.location} (${stock.quantity})`,
                  );
                  continue;
                }

                await this.updateProductStock(
                  variantId,
                  stock.location,
                  stock.quantity,
                  false,
                );
                this.logger.log(
                  `Stock updated for product ${item.shopifyId}, location ${stock.location}`,
                );
              }
            } catch (stockError) {
              this.logError(
                `Error updating stock for product ${item.shopifyId}, location ${stock.location}`,
                stockError,
              );
            }
          }
        } catch (productStockError) {
          this.logError(
            `Error fetching product stocks for ${item.shopifyId}`,
            productStockError,
          );
        }
      }
      this.websocketGateway.emitShopifyProductStockChanged();
    } catch (shopifyItemsError) {
      this.logError('Error fetching Shopify items', shopifyItemsError);
    }
  }

  async getAllWebhooks() {
    const query = `
      query GetWebhooks {
        webhookSubscriptions(first: 250) {
          edges {
            node {
              id
              callbackUrl
              format
              topic
              createdAt
              updatedAt
              
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(query);
      });

      this.handleGraphQLErrors(response);

      return response.data.webhookSubscriptions.edges.map(
        (edge: any) => edge.node,
      );
    } catch (error) {
      this.logError('Error fetching webhooks', error);
      throw new HttpException(
        'Unable to fetch webhooks from Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createWebhook(callbackUrl: string, topic: string) {
    const mutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
            callbackUrl
            format
            topic
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            topic: topic,
            webhookSubscription: {
              callbackUrl: callbackUrl,
            },
          },
        });
      });

      this.handleGraphQLErrors(
        response,
        'data.webhookSubscriptionCreate.userErrors',
      );

      return response.data.webhookSubscriptionCreate.webhookSubscription;
    } catch (error) {
      this.logError('Error creating webhook', error);
      throw new HttpException(
        'Unable to create webhook in Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // we are cancelling it at our side first, then this function cancels it at shopify side(we need to call it at orderservice though)
  async cancelShopifyOrderAtShopify(
    orderId: string,
    notifyCustomer: boolean = true,
    restock: boolean = true,
    reason: OrderCancelReason = OrderCancelReason.CUSTOMER,
    staffNote?: string,
  ) {
    const mutation = `
      mutation OrderCancel($orderId: ID!, $notifyCustomer: Boolean, $refundMethod: OrderCancelRefundMethodInput!, $restock: Boolean!, $reason: OrderCancelReason!, $staffNote: String) {
        orderCancel(orderId: $orderId, notifyCustomer: $notifyCustomer, refundMethod: $refundMethod, restock: $restock, reason: $reason, staffNote: $staffNote) {
          job {
            id
            done
          }
          orderCancelUserErrors {
            field
            message
            code
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // Format the orderId to GID format
      const formattedOrderId = orderId.includes('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      this.logger.log(
        'Cancelling Shopify order with formatted ID:',
        formattedOrderId,
      );

      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            orderId: formattedOrderId,
            notifyCustomer: notifyCustomer,
            refundMethod: {
              originalPaymentMethodsRefund: true,
            },
            restock: restock,
            reason: reason,
            staffNote: staffNote,
          },
        });
      });

      this.handleGraphQLErrors(
        response,
        'data.orderCancel.orderCancelUserErrors',
      );

      return response.data.orderCancel;
    } catch (error) {
      this.logError('Error cancelling order', error);
      throw new HttpException(
        'Unable to cancel order in Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Partially refund a Shopify order by refunding specific line items with quantities
   * This is used for partial cancellations since orderCancel mutation cancels entire orders
   */
  async partialRefundShopifyOrder(
    orderId: string,
    lineItemRefunds: Array<{
      lineItemId: string;
      quantity: number;
      restockType?: 'RETURN' | 'CANCEL' | 'LEGACY_RESTOCK' | 'NO_RESTOCK';
      locationId?: string; // Shopify location ID for restocking
    }>,
    notifyCustomer: boolean = true,
    note?: string,
  ) {
    const mutation = `
      mutation refundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund {
            id
            createdAt
            order {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // Format the orderId to GID format
      const formattedOrderId = orderId.includes('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      this.logger.log(
        'Creating partial refund for Shopify order with formatted ID:',
        formattedOrderId,
      );
      this.logger.log('Refund line items:', lineItemRefunds);

      // Build refund line items with location for restocking
      const refundLineItems = lineItemRefunds.map((item) => {
        const refundItem: any = {
          lineItemId: item.lineItemId.includes('gid://')
            ? item.lineItemId
            : `gid://shopify/LineItem/${item.lineItemId}`,
          quantity: item.quantity,
          restockType: item.restockType || 'CANCEL',
        };

        // Add locationId if restocking and location is provided
        if (item.restockType !== 'NO_RESTOCK' && item.locationId) {
          refundItem.locationId = item.locationId.includes('gid://')
            ? item.locationId
            : `gid://shopify/Location/${item.locationId}`;
        }

        return refundItem;
      });

      const response = await this.executeGraphQLRequest(async () => {
        const client = await this.getGraphQLClient();
        return await client.request(mutation, {
          variables: {
            input: {
              orderId: formattedOrderId,
              note: note,
              notify: notifyCustomer,
              refundLineItems: refundLineItems,
            },
          },
        });
      });

      this.handleGraphQLErrors(response, 'data.refundCreate.userErrors');

      return response.data.refundCreate.refund;
    } catch (error) {
      this.logError('Error creating partial refund', error);
      throw new HttpException(
        'Unable to create partial refund in Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
