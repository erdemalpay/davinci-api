import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiVersion, Session, shopifyApi } from '@shopify/shopify-api';
import { format } from 'date-fns';
import { LocationService } from '../location/location.service';
import { MenuItem } from '../menu/item.schema';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { CreateOrderDto, OrderStatus } from '../order/order.dto';
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

const NEORAMA_DEPO_LOCATION = 6;

interface SeenUsers {
  [key: string]: boolean;
}

@Injectable()
export class ShopifyService {
  private readonly storeUrl: string;
  private readonly accessToken: string;
  private readonly apiVersion: ApiVersion = ApiVersion.January26;
  private readonly shopify: ReturnType<typeof shopifyApi>;
  private readonly session: Session;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
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
    this.storeUrl = this.configService.get<string>('SHOPIFY_STORE_URL');
    this.accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN') || '';
    
    if (!this.storeUrl) {
      console.warn('Shopify store URL not configured');
    }

    // Custom Store App için adminApiAccessToken gerekli
    this.shopify = shopifyApi({
      apiKey: this.configService.get<string>('SHOPIFY_API_KEY') || '',
      apiSecretKey: this.configService.get<string>('SHOPIFY_API_SECRET') || '',
      apiVersion: this.apiVersion,
      scopes: ['read_products', 'write_products', 'read_orders', 'write_orders', 'read_inventory', 'write_inventory'],
      hostName: this.configService.get<string>('SHOPIFY_LOCAL_URL') || '',
      isEmbeddedApp: false,
      isCustomStoreApp: true,
      adminApiAccessToken: this.accessToken, // Custom Store App için gerekli
    });

    // Create session for GraphQL client
    this.session = new Session({
      id: `${this.storeUrl}_session`,
      shop: this.storeUrl || '',
      accessToken: this.accessToken,
      state: 'state',
      isOnline: false,
    });
  }

  private async getGraphQLClient() {
    return new this.shopify.clients.Graphql({ session: this.session });
  }

  async getAllProducts() {
    const allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    const client = await this.getGraphQLClient();

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
                      weight
                      weightUnit
                      image {
                        url
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
        const response = await client.request(query, {
          variables: cursor ? { cursor } : {},
        });

        if (response.errors) {
          throw new HttpException(
            `Shopify API error: ${JSON.stringify(response.errors)}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const products = response.data.products.edges.map(
          (edge: any) => edge.node,
        );
        allProducts.push(...products);

        hasNextPage = response.data.products.pageInfo.hasNextPage;
        cursor = response.data.products.pageInfo.endCursor;
      } catch (error) {
        console.error(
          'Error fetching products:',
          JSON.stringify(error.response?.data || error.message),
        );
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
    const formattedProductId = productId.includes('gid://')
      ? productId
      : `gid://shopify/Product/${productId}`;

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

    const client = await this.getGraphQLClient();

    try {
      const response = await client.request(query, {
        variables: { id: formattedProductId },
      });

      if (response.errors) {
        throw new HttpException(
          `Shopify API error: ${JSON.stringify(response.errors)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return response.data.product;
    } catch (error) {
      console.error(
        'Error fetching product by ID:',
        JSON.stringify(error.response?.data || error.message),
      );
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

    const client = await this.getGraphQLClient();

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
        const response = await client.request(query, {
          variables: cursor ? { cursor } : {},
        });

        if (response.errors) {
          throw new HttpException(
            `Shopify API error: ${JSON.stringify(response.errors)}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const orders = response.data.orders.edges.map(
          (edge: any) => edge.node,
        );
        allOrders.push(...orders);

        hasNextPage = response.data.orders.pageInfo.hasNextPage;
        cursor = response.data.orders.pageInfo.endCursor;
      } catch (error) {
        console.error(
          'Error fetching orders:',
          JSON.stringify(error.response?.data || error.message),
        );
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

    const client = await this.getGraphQLClient();

    try {
      const response = await client.request(query);

      if (response.errors) {
        throw new HttpException(
          `Shopify API error: ${JSON.stringify(response.errors)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return response.data.collections.edges.map(
        (edge: any) => edge.node,
      );
    } catch (error) {
      console.error(
        'Error fetching collections:',
        JSON.stringify(error.response?.data || error.message),
      );
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

    const client = await this.getGraphQLClient();

    try {
      const response = await client.request(query);

      if (response.errors) {
        throw new HttpException(
          `Shopify API error: ${JSON.stringify(response.errors)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return response.data.locations.edges.map((edge: any) => edge.node);
    } catch (error) {
      console.error(
        'Error fetching locations:',
        JSON.stringify(error.response?.data || error.message),
      );
      throw new HttpException(
        'Unable to fetch locations from Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createItemProduct(user: User, item: MenuItem) {
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
      const shopifyProduct = await this.createProduct(createShopifyProductItem);
      if (shopifyProduct) {
        const productId = shopifyProduct.id.split('/').pop();
        const updatedItem = { ...item.toObject(), shopifyId: productId };
        await this.menuService.updateItem(user, item._id, updatedItem);
        const productStock = await this.accountingService.findProductStock(
          item.matchedProduct,
        );
        const storeStock = productStock.find((stock) => stock.location === 6);
        if (storeStock && shopifyProduct.variants?.edges?.[0]?.node?.id) {
          const variantId = shopifyProduct.variants.edges[0].node.id
            .split('/')
            .pop();
          await this.updateProductStock(
            productId,
            variantId,
            6,
            storeStock.quantity,
          );
        }
      }
    } catch (error) {
      console.error('Failed to create item product:', error);
      throw new HttpException(
        'Failed to process item product due to an error.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createProduct(productInput: any) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

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

    const client = await this.getGraphQLClient();

    try {
      const response = await client.request(mutation, {
        variables: {
          input: {
            title: productInput.title,
            descriptionHtml: productInput.descriptionHtml,
            productType: productInput.productType,
            variants: productInput.variants,
            images: productInput.images,
          },
        },
      });

      if (response.errors || response.data.productCreate.userErrors?.length > 0) {
        const errors = response.errors || response.data.productCreate.userErrors;
        throw new HttpException(
          `Shopify API error: ${JSON.stringify(errors)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return response.data.productCreate.product;
    } catch (error) {
      console.error(
        'Error creating product:',
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      throw new HttpException(
        'Unable to create product in Shopify.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductStock(
    productId: string,
    variantId: string,
    stockLocationId: number,
    stockCount: number,
  ): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const foundLocation = await this.locationService.findLocationById(
      stockLocationId,
    );
    if (!foundLocation.shopifyId) {
      console.log(
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

    const client = await this.getGraphQLClient();

    let inventoryItemId: string;
    try {
      const variantResponse = await client.request(variantQuery, {
        variables: {
          id: variantId.includes('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`,
        },
      });

      if (variantResponse.errors || !variantResponse.data.productVariant) {
        throw new HttpException(
          `Unable to fetch variant: ${JSON.stringify(variantResponse.errors)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      inventoryItemId = variantResponse.data.productVariant.inventoryItem.id;
    } catch (error) {
      console.error('Error fetching variant:', error);
      throw new HttpException(
        'Unable to fetch variant inventory item.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      const response = await client.request(mutation, {
        variables: {
          input: {
            reason: 'correction',
            setQuantities: [
              {
                inventoryItemId: inventoryItemId,
                locationId: locationId.includes('gid://') ? locationId : `gid://shopify/Location/${locationId}`,
                quantity: stockCount,
              },
            ],
          },
        },
      });

      if (response.errors || response.data.inventorySetOnHandQuantities.userErrors?.length > 0) {
        const errors = response.errors || response.data.inventorySetOnHandQuantities.userErrors;
        console.error('Failed to update stock:', JSON.stringify(errors));
        return false;
      }

      console.log('Stock updated successfully.');
      await this.websocketGateway.emitShopifyProductStockChanged();
      return true;
    } catch (error) {
      console.error(
        'Error updating stock:',
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      throw new HttpException(
        'Unable to update product stock.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductImages(itemId: number): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
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

    const productId = `gid://shopify/Product/${item.shopifyId}`;
    const product = await this.getProductById(productId);
    if (!product) {
      throw new HttpException(
        `Shopify product not found for ID ${item.shopifyId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      await this.createProductImages(item.shopifyId, urls);
      console.log(`Successfully updated images for product ${item.shopifyId}`);
    } catch (err) {
      console.error(
        `Failed to push images for product ${item.shopifyId}:`,
        err.response?.data || err.message,
      );
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
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
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

    const client = await this.getGraphQLClient();

    try {
      const response = await client.request(mutation, {
        variables: {
          input: {
            id: variantId,
            price: newPrice.toString(),
          },
        },
      });

      if (response.errors || response.data.productVariantUpdate.userErrors?.length > 0) {
        const errors = response.errors || response.data.productVariantUpdate.userErrors;
        console.error('Failed to update price:', JSON.stringify(errors));
        return false;
      }

      console.log(`Shopify ${productId} price updated successfully.`);
      await this.websocketGateway.emitShopifyProductStockChanged();
      return true;
    } catch (error) {
      console.error(
        'Error updating price:',
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      throw new HttpException(
        'Unable to update product price.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createProductImages(productId: string, imageArray: string[]) {
    const client = await this.getGraphQLClient();

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
        const response = await client.request(mutation, {
          variables: {
            productId: `gid://shopify/Product/${productId}`,
            media: [
              {
                originalSource: imageArray[i],
                mediaContentType: 'IMAGE',
              },
            ],
          },
        });

        if (response.errors || response.data.productCreateMedia.userErrors?.length > 0) {
          const errors = response.errors || response.data.productCreateMedia.userErrors;
          console.error(
            `Error uploading image ${i + 1}:`,
            JSON.stringify(errors, null, 2),
          );
          throw new HttpException(
            `Unable to upload image ${i + 1} to Shopify.`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        console.log(`Image ${i + 1} uploaded successfully`);
      } catch (error) {
        console.error(
          `Error uploading image ${i + 1}:`,
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          `Unable to upload image ${i + 1} to Shopify.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async orderCreateWebHook(data?: any) {
    try {
      if (!data) {
        throw new HttpException(
          'Invalid request: Missing data',
          HttpStatus.BAD_REQUEST,
        );
      }

      console.log('Received Shopify order webhook data:', data);

      const lineItems = data?.line_items ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv');

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (lineItems.length === 0) {
        console.log('No line items to process');
        return;
      }

      if (data?.financial_status !== 'paid' && data?.financial_status !== 'pending') {
        console.log(`Skipping order as financial status is not 'paid' or 'pending'`);
        return;
      }

      for (const lineItem of lineItems) {
        try {
          const { quantity, variant_id, product_id, price } = lineItem;

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
            console.log(`Menu item not found for productId: ${product_id}`);
            continue;
          }

          const foundLocation = await this.locationService.findByShopifyId(
            data?.location_id?.toString(),
          );
          const locationId = foundLocation?._id || 4;

          const foundPaymentMethod =
            await this.accountingService.findPaymentMethodByShopifyId(
              data?.payment_gateway_names?.[0],
            );

          const foundShopifyOrder = await this.orderService.findByShopifyId(
            data?.id?.toString(),
          );
          if (foundShopifyOrder) {
            console.log(
              `Order already exists for shopify order id: ${data.id}, skipping to next item.`,
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
            deliveredAt: new Date(),
            deliveredBy: constantUser?._id,
            preparedAt: new Date(),
            preparedBy: constantUser?._id,
            status: OrderStatus.AUTOSERVED,
            stockLocation: foundLocation?._id || locationId,
            createdAt: new Date(data?.created_at || new Date()),
            tableDate: new Date(),
            createdBy: constantUser?._id,
            stockNote: StockHistoryStatusEnum.SHOPIFYORDERCREATE,
            shopifyId: data?.id?.toString(),
            ...(foundPaymentMethod && {
              paymentMethod: foundPaymentMethod._id,
            }),
            ...(shopifyOrderNumber && {
              shopifyOrderNumber: shopifyOrderNumber.toString(),
            }),
          };

          if (data?.shipping_address) {
            createOrderObject = {
              ...createOrderObject,
              shopifyCustomer: {
                id: data?.customer?.id?.toString(),
                firstName: data?.customer?.first_name,
                lastName: data?.customer?.last_name,
                email: data?.customer?.email,
                phone: data?.customer?.phone,
                location: foundLocation?._id || locationId,
              },
            };
          }

          try {
            const order = await this.orderService.createOrder(
              constantUser,
              createOrderObject,
            );
            console.log('Order created:', order);

            if (data?.shipping_address && foundLocation) {
              const visits = await this.visitService.findByDateAndLocation(
                format(order.createdAt, 'yyyy-MM-dd'),
                2,
              );
              const uniqueVisitUsers =
                visits
                  ?.reduce(
                    (
                      acc: { unique: typeof visits; seenUsers: SeenUsers },
                      visit,
                    ) => {
                      acc.seenUsers = acc.seenUsers || {};
                      if (
                        visit?.user &&
                        !acc.seenUsers[(visit as any).user]
                      ) {
                        acc.seenUsers[(visit as any).user] = true;
                        acc.unique.push(visit);
                      }
                      return acc;
                    },
                    { unique: [], seenUsers: {} },
                  )
                  ?.unique?.map((visit) => visit.user) ?? [];

              const message = {
                key: 'ShopifyPickupOrderArrived',
                params: {
                  product: foundMenuItem.name,
                },
              };
              const notificationEvents =
                await this.notificationService.findAllEventNotifications();

              const shopifyTakeawayEvent = notificationEvents.find(
                (notification) =>
                  notification.event === NotificationEventType.SHOPIFYTAKEAWAY,
              );

              if (shopifyTakeawayEvent) {
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

            const createdCollection = {
              location: 4,
              paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
              amount: parseFloat(price) * quantity,
              status: OrderCollectionStatus.PAID,
              orders: [
                {
                  order: order._id,
                  paidQuantity: quantity,
                },
              ],
              createdBy: constantUser._id,
              tableDate: new Date(),
              shopifyId: data?.id?.toString(),
              ...(shopifyOrderNumber && {
                shopifyOrderNumber: shopifyOrderNumber.toString(),
              }),
            };

            try {
              const collection = await this.orderService.createCollection(
                constantUser,
                createdCollection,
              );
              console.log('Collection created:', collection);
            } catch (collectionError) {
              console.error(
                'Error creating collection:',
                collectionError?.message || collectionError,
              );
            }
          } catch (orderError) {
            console.error('Error creating order:', orderError?.message || orderError);
          }
        } catch (itemError) {
          console.error('Error processing line item:', itemError?.message || itemError);
        }
      }
    } catch (error) {
      console.error('Error in orderCreateWebHook:', error);
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

      console.log('Received Shopify cancel webhook data:', data);

      const lineItems = data?.line_items ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv');

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (lineItems.length === 0) {
        console.log('No line items to process');
        return;
      }

      if (data?.financial_status !== 'refunded' && data?.cancelled_at === null) {
        console.log(`Skipping order as status is not 'refunded' or cancelled`);
        return;
      }

      for (const lineItem of lineItems) {
        try {
          const orderId = data?.id?.toString();
          if (!orderId) {
            throw new HttpException(
              'Invalid line item data',
              HttpStatus.BAD_REQUEST,
            );
          }
          await this.orderService.cancelShopifyOrder(
            constantUser,
            orderId,
            lineItem.quantity,
          );
        } catch (itemError) {
          console.error('Error processing line item:', itemError.message);
        }
      }
    } catch (error) {
      console.error('Error in orderCancelWebHook:', error.message);
    }
  }

  async updateAllProductStocks() {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    try {
      const shopifyItems = await this.menuService.getAllShopifyItems();
      console.log('Fetched Shopify Items:', shopifyItems);
      const shopifyProducts = await this.getAllProducts();
      console.log('Fetched Shopify Products:', shopifyProducts);
      const locations = await this.locationService.findAllLocations();
      console.log('Fetched Stock Locations:', locations);

      for (const item of shopifyItems) {
        try {
          const productStocks = await this.accountingService.findProductStock(
            item.matchedProduct,
          );
          console.log(
            `Fetched product stocks for ${item.shopifyId}:`,
            productStocks,
          );
          for (const stock of productStocks) {
            try {
              if (!item.shopifyId) {
                console.error(
                  `Product ${item.matchedProduct} does not have a Shopify ID`,
                );
                continue;
              }

              const productId = `gid://shopify/Product/${item.shopifyId}`;
              const foundShopifyProduct = await this.getProductById(productId);
              if (!foundShopifyProduct) {
                console.error(`Product ${item.shopifyId} not found in Shopify`);
                continue;
              }

              const foundLocation = locations?.find(
                (location) => location._id === stock.location,
              );
              if (!foundLocation?.shopifyId) {
                console.error(
                  `Location ${stock.location} does not have a Shopify ID`,
                );
                continue;
              }

              const variantId = foundShopifyProduct.variants?.edges?.[0]?.node?.id;
              if (variantId) {
                await this.updateProductStock(
                  item.shopifyId,
                  variantId,
                  stock.location,
                  stock.quantity,
                );
                console.log(
                  `Stock updated for product ${item.shopifyId}, location ${stock.location}`,
                );
              }
            } catch (stockError) {
              console.error(
                `Error updating stock for product ${item.shopifyId}, location ${stock.location}:`,
                stockError.message,
              );
            }
          }
        } catch (productStockError) {
          console.error(
            `Error fetching product stocks for ${item.shopifyId}:`,
            productStockError.message,
          );
        }
      }
    } catch (shopifyItemsError) {
      console.error('Error fetching Shopify items:', shopifyItemsError.message);
    }
  }
}

