import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import { LocationService } from '../location/location.service';
import { MenuItem } from '../menu/item.schema';
import {
  NotificationEventType,
  NotificationType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { CreateOrderDto, OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { StockHistoryStatusEnum } from './../accounting/accounting.dto';
import { AccountingService } from './../accounting/accounting.service';
import { MenuService } from './../menu/menu.service';
import { OrderCollectionStatus } from './../order/order.dto';
import { OrderService } from './../order/order.service';
import { IkasGateway } from './ikas.gateway';

interface SeenUsers {
  [key: string]: boolean;
}
@Injectable()
export class IkasService {
  private readonly tokenPayload: Record<string, string>;

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
    private readonly ikasGateway: IkasGateway,
    private readonly notificationService: NotificationService,
    private readonly visitService: VisitService,
  ) {
    this.tokenPayload = {
      grant_type: 'client_credentials',
      client_id: this.configService.get<string>('IKAS_CLIENT_ID'),
      client_secret: this.configService.get<string>('IKAS_API_SECRET'),
    };
  }

  isTokenExpired(createdAt: number, expiresIn: number): boolean {
    const expiresInMs = expiresIn * 1000;
    const currentTime = new Date().getTime();
    return currentTime - createdAt > expiresInMs;
  }

  async getToken() {
    let ikasToken = await this.redisService.get(RedisKeys.IkasToken);
    if (
      !ikasToken ||
      this.isTokenExpired(ikasToken.createdAt, ikasToken.expiresIn)
    ) {
      const apiUrl = 'https://davinci.myikas.com/api/admin/oauth/token';
      await this.redisService.reset(RedisKeys.IkasToken);
      try {
        const response = await this.httpService
          .post(apiUrl, this.tokenPayload, {
            headers: { 'Content-Type': 'application/json' },
          })
          .toPromise();
        ikasToken = {
          token: response.data.access_token,
          createdAt: new Date().getTime(),
          expiresIn: response.data.expires_in,
        };
        await this.redisService.set(RedisKeys.IkasToken, ikasToken);

        return ikasToken.token;
      } catch (error) {
        console.error('Error fetching Ikas token:', error.message);
        throw new HttpException(
          'Unable to fetch Ikas token',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return ikasToken.token;
  }
  async getAllProducts() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    // Function to fetch a batch of products
    const fetchBatch = async (page: number) => {
      const query = {
        query: `
  {
    listProduct(pagination: { page: ${page}, limit: 50 }) {
      data {
        id
        name
        description
        categories{
          id
          name
          }
        shortDescription
        weight
        baseUnit {
          type  
        }
        brandId
        categoryIds
        googleTaxonomyId
        salesChannelIds
        tagIds
        translations {
          locale
          name
          description
        }
        metaData {
          id
          canonicals
          description
          disableIndex
          metadataOverrides {
            description
            language
            pageTitle
            storefrontId
          }
          pageTitle
          slug
          targetType
          translations {
            locale
            description
            pageTitle
            slug
          }
        }
        productOptionSetId
        productVariantTypes {
          order
          variantTypeId
          variantValueIds
        }
        type
        totalStock
        variants {
          id
          attributes {
            productAttributeId
            productAttributeOptionId
            value
          }
          stocks{
            id
            productId
            stockCount
            stockLocationId
          }
          barcodeList
          fileId
          hsCode
          images {
            fileName
            imageId
            isMain
            isVideo
            order
          }
          isActive
          prices {
            currency
            sellPrice
            discountPrice
            buyPrice
            priceListId
          }
          sku
          unit {
            type
          }
          weight
        }
      }
    }
  }`,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listProduct?.data;
      } catch (error) {
        console.error(
          'Error fetching products:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new HttpException(
          'Unable to fetch products from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    const allProducts: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const batch = await fetchBatch(page);

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allProducts.push(...batch);
        page += 1;
      }
    }

    return allProducts;
  }
  async getAllOrders() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    // Function to fetch a batch of products
    const fetchBatch = async (page: number) => {
      const query = {
        query: `
  {
    listOrder(pagination: { page: ${page}, limit: 50 }) {
      data {
        id
        stockLocationId
        branchSessionId
        customerId
        orderNumber
        orderedAt
        salesChannelId
      }
    }
  }`,
      };
      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listOrder.data;
      } catch (error) {
        console.error(
          'Error fetching products:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new HttpException(
          'Unable to fetch products from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    const allOrders: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const batch = await fetchBatch(page);

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allOrders.push(...batch);
        page += 1;
      }
    }

    return allOrders;
  }

  async getAllCategories() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const fetchCategories = async () => {
      const query = {
        query: `{
        listCategory {
          id
          name
          description
          parentId
          categoryPath
        }
      }`,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listCategory; // Return the list of categories
      } catch (error) {
        console.error(
          'Error fetching categories:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new HttpException(
          'Unable to fetch categories from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await fetchCategories(); // Fetch and return all categories
  }
  async getAllPriceLists() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const fetchPriceLists = async () => {
      const query = {
        query: `{
          listPriceList {
            id
            addProductsAutomatically
            currency
            currencyCode
            currencySymbol
            name
          }
        }`,
      };
      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listPriceList;
      } catch (error) {
        console.error(
          'Error fetching price lists:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new HttpException(
          'Unable to fetch price lists from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await fetchPriceLists();
  }
  async getAllStockLocations() {
    const token = await this.getToken(); // Fetch the authentication token
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const fetchStockLocations = async () => {
      const query = {
        query: `{
        listStockLocation {
          address {
            address
            city {
              code
              id
              name
            }
            country {
              code
              id
              name
            }
            district {
              code
              id
              name
            }
            phone
            postalCode
            state {
              code
              id
              name
            }
          }
          createdAt
          deleted
          id
          name
          type
          updatedAt
        }
      }`,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listStockLocation; // Return the list of stock locations
      } catch (error) {
        console.error(
          'Error fetching stock locations:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          'Unable to fetch stock locations from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await fetchStockLocations(); // Fetch and return all stock locations
  }
  async getAllSalesChannels() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const fetchSalesChannels = async () => {
      const query = {
        query: `{
          listSalesChannel {
            createdAt
            deleted
            id
            name
            priceListId
            stockLocations {
              order
            }
            paymentGateways {
              order
            }
            type
            updatedAt
          }
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listSalesChannel; // Return the list of sales channels
      } catch (error) {
        console.error(
          'Error fetching sales channels:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new HttpException(
          'Unable to fetch sales channels from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await fetchSalesChannels(); // Fetch and return all sales channels
  }
  async createItemProduct(user: User, item: MenuItem) {
    try {
      const createIkasProductItem = {
        name: item.name,
        description: item.description?.trim() || '-',
        type: 'PHYSICAL',
        categoryIds: item.productCategories ?? [],
        salesChannelIds: [
          '9c66aacf-bab6-4189-905b-2c90f404388a',
          'a311f416-e485-433f-8589-ed5e334bcc4b',
          '38348181-957d-4964-a9e8-81d8cd6482b4',
          '2df1fdbd-e6d6-471d-96de-33fad5dfa944',
          '9b9a1d9f-2b98-433d-8f58-e56bd169db97',
        ],
        variants: [
          {
            isActive: true,
            prices: [
              {
                sellPrice: item.price,
                discountPrice: item?.ikasDiscountedPrice ?? null,
              },
            ],
          },
        ],
        images: [
          ...(item.imageUrl ? [item.imageUrl] : []),
          ...(Array.isArray(item.productImages) ? item.productImages : []),
        ],
      };
      const ikasProduct = await this.createProduct(createIkasProductItem);
      if (ikasProduct) {
        const updatedItem = { ...item.toObject(), ikasId: ikasProduct?.id };
        await this.menuService.updateItem(user, item._id, updatedItem);
        const productStock = await this.accountingService.findProductStock(
          item.matchedProduct,
        );
        const storeStock = productStock.find((stock) => stock.location === 6);
        if (storeStock) {
          await this.updateProductStock(
            ikasProduct?.id,
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
    // this condition can be removed to test in staging
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
    console.log('productInput', productInput);
    const saveProductMutation = async () => {
      const data = {
        query: `
        mutation {
          saveProduct(input: {
            name: "${productInput.name}",
            description: "${productInput.description}",
            type: ${productInput.type}, 
            categoryIds: ${JSON.stringify(productInput.categoryIds)}, 
            salesChannelIds: ${JSON.stringify(productInput.salesChannelIds)}, 
            variants: [
              {
                isActive: ${productInput.variants[0].isActive},
                prices: [
                  { sellPrice: ${productInput.variants[0].prices[0].sellPrice},
                    discountPrice: ${
                      productInput.variants[0].prices[0].discountPrice
                    }
                  }
                ]
              }
            ]
          }) {
            id
            name
            description
            type
            categoryIds
            salesChannelIds
            variants {
              id
              isActive
              prices {
                sellPrice
                discountPrice
              }
            }
          }
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, data, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();
        console.log(response);
        return response.data.data.saveProduct; // Return the saved product
      } catch (error) {
        console.error(
          'Error saving product:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          'Unable to save product to Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };
    const savedProduct = await saveProductMutation();
    if (productInput.images && productInput.images.length > 0) {
      const variantId = savedProduct?.variants[0].id;
      await this.createProductImages(variantId, productInput.images);
    }
    return savedProduct;
  }
  async updateProductStock(
    productId: string, //this is the ikas id for the product
    stockLocationId: number,
    stockCount: number,
  ): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
    const allProducts = await this.getAllProducts();

    const foundProduct = allProducts.find(
      (product) => product?.id === productId,
    );
    const foundStockLocation = await this.locationService.findLocationById(
      stockLocationId,
    );
    if (!foundStockLocation.ikasId) {
      console.log(
        `Stock Location with ID ${stockLocationId} does not have ikas id`,
      );
      return;
    }
    if (!foundProduct) {
      throw new HttpException(
        `Product with ID ${productId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    const updateProductStockMutation = async (): Promise<boolean> => {
      const data = {
        query: `
        mutation {
          saveProductStockLocations(input: {
            productStockLocationInputs: [
              {
                productId: "${productId}",
                stockCount: ${stockCount},
                stockLocationId: "${foundStockLocation.ikasId}",
                variantId: "${foundProduct?.variants[0].id}"
              }
            ]
          })
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, data, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();
        if (response.data.data.saveProductStockLocations) {
          console.log('Stock updated successfully.');
          await this.ikasGateway.emitIkasProductStockChanged();
          return true; // Return true if the mutation succeeds
        } else {
          console.error('Failed to update stock: Mutation returned false.');
          return false; // Return false if the mutation fails
        }
      } catch (error) {
        console.error(
          'Error updating stock:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        console.log(error);
        throw new HttpException(
          'Unable to update product stock.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await updateProductStockMutation();
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
    if (!item.ikasId) {
      throw new HttpException(
        `Menu item with ID ${itemId} does not have an Ikas ID`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const urls: string[] = [];
    if (item.imageUrl) {
      urls.push(item.imageUrl);
    }
    item.productImages?.forEach((url) => urls.push(url));
    const all = await this.getAllProducts();
    const ikas = all.find((p) => p.id === item.ikasId);
    if (!ikas || !ikas.variants.length) {
      throw new HttpException(
        `Ikas product or variant not found for ID ${item.ikasId}`,
        HttpStatus.NOT_FOUND,
      );
    }
    const variantId = ikas.variants[0].id;
    try {
      await this.createProductImages(variantId, urls);
      console.log(`Successfully updated images for variant ${variantId}`);
    } catch (err) {
      console.error(
        `Failed to push images for variant ${variantId}:`,
        err.response?.data || err.message,
      );
      throw new HttpException(
        'Unable to upload product images.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductPrice(
    productId: string, //this is the ikas id for the product
    newPrice: number,
  ): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
    const allProducts = await this.getAllProducts();

    const foundProduct = allProducts.find(
      (product) => product?.id === productId,
    );
    if (!foundProduct) {
      throw new HttpException(
        `Product with ID ${productId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    const updateProductPriceMutation = async (): Promise<boolean> => {
      const data = {
        query: `
        mutation {
          saveVariantPrices(input: {
            variantPriceInputs: [
              {
                price:{
                  sellPrice: ${newPrice},
      }
                productId: "${productId}",
                variantId: "${foundProduct?.variants[0]?.id}"
              }
            ]
          })
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, data, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();
        if (response.data.data.saveVariantPrices) {
          console.log(`ikas ${productId} price updated successfully.`);
          await this.ikasGateway.emitIkasProductStockChanged();
          return true;
        } else {
          console.error('Failed to update price: Mutation returned false.');
          return false;
        }
      } catch (error) {
        console.error(
          'Error updating price:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        console.log(error);
        throw new HttpException(
          'Unable to update product price.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await updateProductPriceMutation();
  }

  async getAllWebhooks() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const fetchWebhooks = async () => {
      const query = {
        query: `{
        listWebhook {
          createdAt
          deleted
          endpoint
          id
          scope
          updatedAt
        }
      }`,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, query, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();

        return response.data.data.listWebhook; // Return the list of webhooks
      } catch (error) {
        console.error(
          'Error fetching webhooks:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          'Unable to fetch webhooks from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    return await fetchWebhooks(); // Fetch and return all webhooks
  }

  async createOrderWebhook() {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const saveWebhookMutation = async () => {
      const data = {
        query: `
        mutation {
          saveWebhook(
            input: {
              scopes: ["store/order/updated"]
              endpoint: "https://apiv2.davinciboardgame.com/ikas/order-cancel-webhook"
            }
          ) {
            id
            scope
          }
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, data, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();
        console.log(response);
        return response.data.data.saveWebhook; // Return the saved webhook
      } catch (error) {
        console.error(
          'Error saving webhook:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          'Unable to save webhook to Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    const savedWebhook = await saveWebhookMutation();
    return savedWebhook;
  }
  async deleteWebhook(scopes: string[]) {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const deleteWebhookMutation = async () => {
      // Serialize the scopes array into a GraphQL-friendly format
      const serializedScopes = JSON.stringify(scopes);

      const data = {
        query: `
        mutation {
          deleteWebhook(scopes: ${serializedScopes})
        }
      `,
      };

      try {
        const response = await this.httpService
          .post(apiUrl, data, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          .toPromise();
        console.log('Webhook deleted:', response.data);
        return response.data.data.deleteWebhook; // Return the result of deletion
      } catch (error) {
        console.error(
          'Error deleting webhook:',
          JSON.stringify(error.response?.data || error.message, null, 2),
        );
        throw new HttpException(
          'Unable to delete webhook from Ikas.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    };

    const deleteResult = await deleteWebhookMutation();
    return deleteResult;
  }

  async createProductImages(variantId: string, imageArray: string[]) {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/product/upload/image';

    const uploadImagesMutation = async () => {
      for (let i = 0; i < imageArray.length; i++) {
        const isMain = i === 0;
        const imageData = {
          productImage: {
            variantIds: [variantId],
            url: imageArray[i],
            order: i.toString(),
            isMain: isMain.toString(),
          },
        };
        try {
          const response = await this.httpService
            .post(apiUrl, imageData, {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            })
            .toPromise();
          console.log(`Image ${i + 1} uploaded successfully`, response.data);
        } catch (error) {
          console.error(
            `Error uploading image ${i + 1}:`,
            JSON.stringify(error.response?.data || error.message, null, 2),
          );
          throw new HttpException(
            `Unable to upload image ${i + 1} to Ikas.`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
    };
    await uploadImagesMutation();
  }

  async orderCreateWebHook(data?: any) {
    try {
      if (!data?.merchantId) {
        throw new HttpException(
          'Invalid request: Missing merchantId',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (typeof data?.data === 'string') {
        try {
          data.data = JSON.parse(data.data);
        } catch (error) {
          throw new HttpException(
            'Invalid JSON format in data',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      console.log('Received data:', data);

      const orderLineItems = data?.data?.orderLineItems ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv'); // Required for stock consumption

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (orderLineItems.length === 0) {
        console.log('No order line items to process');
        return;
      }
      if (data?.data?.status !== 'CREATED') {
        console.log(`Skipping item as status is not 'CREATED'`);
        return;
      }
      for (const orderLineItem of orderLineItems) {
        try {
          const { quantity, stockLocationId, id, finalPrice } = orderLineItem;
          const { productId } = orderLineItem.variant;

          if (!productId || !stockLocationId || !quantity) {
            throw new HttpException(
              'Invalid order line item data',
              HttpStatus.BAD_REQUEST,
            );
          }

          const foundMenuItem = await this.menuService.findByIkasId(productId);
          if (!foundMenuItem?.matchedProduct) {
            console.log(`Menu item not found for productId: ${productId}`);
            continue;
          }

          const foundLocation = await this.locationService.findByIkasId(
            stockLocationId,
          );
          if (!foundLocation) {
            console.log(
              `Location not found for stockLocationId: ${stockLocationId}`,
            );
            continue;
          }

          const foundPaymentMethod =
            await this.accountingService.findPaymentMethodByIkasId(
              data?.data?.salesChannelId,
            );
          const ikasOrderNumber = data?.data?.orderNumber;
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
            deliveredBy: constantUser?._id,
            preparedAt: new Date(),
            preparedBy: constantUser?._id,
            status: OrderStatus.AUTOSERVED,
            stockLocation: foundLocation._id,
            createdAt: new Date(),
            tableDate: new Date(),
            createdBy: constantUser?._id,
            stockNote: StockHistoryStatusEnum.IKASORDERCREATE,
            ikasId: id,
            ...(foundPaymentMethod && {
              paymentMethod: foundPaymentMethod._id,
            }),
            ...(ikasOrderNumber && {
              ikasOrderNumber: ikasOrderNumber,
            }),
          };
          if (data?.data?.stockLocationId) {
            const foundLocation = await this.locationService.findByIkasId(
              data?.data?.stockLocationId,
            );
            if (foundLocation) {
              createOrderObject = {
                ...createOrderObject,
                ikasCustomer: {
                  id: data?.data?.customer?.id,
                  firstName: data?.data?.customer?.firstName,
                  lastName: data?.data?.customer?.lastName,
                  email: data?.data?.customer?.email,
                  phone: data?.data?.customer?.phone,
                  location: foundLocation._id,
                },
              };
            }
          }
          try {
            const order = await this.orderService.createOrder(
              constantUser,
              createOrderObject,
            );
            console.log('Order created:', order);
            if (data?.data?.stockLocationId) {
              const foundLocation = await this.locationService.findByIkasId(
                data?.data?.stockLocationId,
              );
              if (foundLocation) {
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
                await this.notificationService.createNotification({
                  type: NotificationType.INFORMATION,
                  selectedUsers: (uniqueVisitUsers as any) ?? [],
                  selectedLocations: [2],
                  seenBy: [],
                  event: NotificationEventType.IKASTAKEAWAY,
                  message: `Yeni bir ikas gel al siparişi(${foundMenuItem.name}) geldi.`,
                });
              }
            }
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
              ikasId: id, //this is ikas order id
              ...(ikasOrderNumber && {
                ikasOrderNumber: ikasOrderNumber,
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
                collectionError.message,
              );
            }
          } catch (orderError) {
            console.error('Error creating order:', orderError.message);
          }
        } catch (itemError) {
          console.error('Error processing order line item:', itemError.message);
        }
      }
    } catch (error) {
      console.error('Error in orderCreateWebHook:', error.message);
    }
  }

  async orderCancelWebHook(data?: any) {
    try {
      if (!data?.merchantId) {
        throw new HttpException(
          'Invalid request: Missing merchantId',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (typeof data?.data === 'string') {
        try {
          data.data = JSON.parse(data.data);
        } catch (error) {
          throw new HttpException(
            'Invalid JSON format in data',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      console.log('Received data:', data);

      const orderLineItems = data?.data?.orderLineItems ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv'); // Required for stock consumption

      if (!constantUser) {
        throw new HttpException(
          'Constant user not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (orderLineItems.length === 0) {
        console.log('No order line items to process');
        return;
      }
      if (!['CANCELLED', 'REFUNDED'].includes(data?.data?.status)) {
        console.log(`Skipping item as status is not 'CANCELLED' or 'REFUNDED'`);
        return;
      }
      for (const orderLineItem of orderLineItems) {
        try {
          const { id } = orderLineItem;
          if (!id) {
            throw new HttpException(
              'Invalid order line item data',
              HttpStatus.BAD_REQUEST,
            );
          }
          await this.orderService.cancelIkasOrder(
            constantUser,
            id,
            orderLineItem.quantity,
          );
        } catch (itemError) {
          console.error('Error processing order line item:', itemError.message);
        }
      }
    } catch (error) {
      console.error('Error in orderCreateWebHook:', error.message);
    }
  }

  async updateAllProductStocks() {
    try {
      const ikasItems = await this.menuService.getAllIkasItems();
      console.log('Fetched Ikas Items:', ikasItems);
      const ikasProducts = await this.getAllProducts();
      console.log('Fetched Ikas Products:', ikasProducts);
      const locations = await this.locationService.findAllLocations();
      console.log('Fetched Stock Locations:', locations);
      for (const item of ikasItems) {
        try {
          const productStocks = await this.accountingService.findProductStock(
            item.matchedProduct,
          );
          console.log(
            `Fetched product stocks for ${item.ikasId}:`,
            productStocks,
          );
          for (const stock of productStocks) {
            try {
              if (!item.ikasId) {
                console.error(
                  `Product ${item.matchedProduct} does not have an Ikas ID`,
                );
                continue;
              }
              const foundIkasProduct = ikasProducts?.find(
                (product) => product?.id === item.ikasId,
              );
              if (!foundIkasProduct) {
                console.error(`Product ${item.ikasId} not found in Ikas`);
                continue;
              }
              const foundLocation = locations?.find(
                (location) => location._id === stock.location,
              );
              if (!foundLocation?.ikasId) {
                console.error(
                  `Location ${stock.location} does not have an Ikas ID`,
                );
                continue;
              }
              if (
                foundIkasProduct?.variants[0]?.stocks[0]?.stockCount !==
                stock.quantity
              ) {
                await this.updateProductStock(
                  item.ikasId,
                  stock.location,
                  stock.quantity,
                );
                console.log(
                  `Stock updated for product ${item.ikasId}, location ${stock.location}`,
                );
              }
            } catch (stockError) {
              console.error(
                `Error updating stock for product ${item.ikasId}, location ${stock.location}:`,
                stockError.message,
              );
            }
          }
        } catch (productStockError) {
          console.error(
            `Error fetching product stocks for ${item.ikasId}:`,
            productStockError.message,
          );
        }
      }
    } catch (ikasItemsError) {
      console.error('Error fetching Ikas items:', ikasItemsError.message);
    }
  }
  async bulkUpdateAllProductStocksAndPrices() {
    try {
      const ikasItems = await this.menuService.getAllIkasItems();
      const ikasProducts = await this.getAllProducts();
      const locations = await this.locationService.findAllLocations();
      const updatesMapStock: {
        [productId: string]: {
          [variantId: string]: {
            [stockLocationId: string]: number;
          };
        };
      } = {};

      const updatesMapPrice: {
        [productId: string]: {
          [variantId: string]: {
            basePrice?: number;
            onlinePrice?: number;
          };
        };
      } = {};
      const IkasOnlinePriceListId = '2ca3e615-516c-4c09-8f6d-6c3183699c21';
      for (const item of ikasItems) {
        if (!item.ikasId) continue;
        const product = ikasProducts.find((p) => p.id === item.ikasId);
        if (!product) continue;
        const variant = product?.variants?.[0];
        if (!variant) continue;
        const variantId = variant.id;

        try {
          const productStocks = await this.accountingService.findProductStock(
            item.matchedProduct,
          );
          for (const stock of productStocks) {
            const locObj = locations.find((loc) => loc._id === stock.location);
            if (!locObj || !locObj.ikasId) continue;
            const currentStockEntry = variant.stocks?.find(
              (s) => s.stockLocationId === locObj.ikasId,
            );
            if (!currentStockEntry) continue;
            if (currentStockEntry.stockCount !== stock.quantity) {
              updatesMapStock[item.ikasId] ??= {};
              updatesMapStock[item.ikasId][variantId] ??= {};
              updatesMapStock[item.ikasId][variantId][locObj.ikasId] =
                stock.quantity;
            }
          }
        } catch (err) {
          console.error(
            `Error fetching product stocks for ${item.ikasId}:`,
            (err as any).message || err,
          );
        }

        const priceBucket = variant.prices || [];
        const ikasBasePriceObj = priceBucket.find((p) => p.priceListId == null);
        const ikasOnlinePriceObj = priceBucket.find(
          (p) => p.priceListId === IkasOnlinePriceListId,
        );

        if (ikasBasePriceObj) {
          if (ikasBasePriceObj.sellPrice !== item.price) {
            updatesMapPrice[item.ikasId] ??= {};
            updatesMapPrice[item.ikasId][variantId] ??= {};
            updatesMapPrice[item.ikasId][variantId].basePrice = item.price;
          }
        } else {
          updatesMapPrice[item.ikasId] ??= {};
          updatesMapPrice[item.ikasId][variantId] ??= {};
          updatesMapPrice[item.ikasId][variantId].basePrice = item.price;
        }

        if (item.onlinePrice != null) {
          if (ikasOnlinePriceObj) {
            if (ikasOnlinePriceObj.sellPrice !== item.onlinePrice) {
              updatesMapPrice[item.ikasId] ??= {};
              updatesMapPrice[item.ikasId][variantId] ??= {};
              updatesMapPrice[item.ikasId][variantId].onlinePrice =
                item.onlinePrice;
            }
          } else {
            updatesMapPrice[item.ikasId] ??= {};
            updatesMapPrice[item.ikasId][variantId] ??= {};
            updatesMapPrice[item.ikasId][variantId].onlinePrice =
              item.onlinePrice;
          }
        }
      }

      const productIdsToUpdateStocks = Object.keys(updatesMapStock);
      const productIdsToUpdatePrices = Object.keys(updatesMapPrice);
      const allProductIdsToUpdate = Array.from(
        new Set([...productIdsToUpdateStocks, ...productIdsToUpdatePrices]),
      );
      if (allProductIdsToUpdate.length === 0) {
        console.log('No products need a stock or price update.');
        return;
      }

      const bulkUpdateInputs = allProductIdsToUpdate
        ?.map((productId) => {
          const product = ikasProducts.find((p) => p.id === productId);
          if (!product) return null;

          const productVariantTypes = product?.productVariantTypes
            ? product?.productVariantTypes?.map((pvt: any) => ({
                order: pvt.order,
                variantTypeName: pvt.variantTypeName || null,
                variantValues: pvt.variantValues
                  ? pvt.variantValues?.map((val: any) => ({
                      colorCode: val.colorCode || null,
                      name: val.name,
                      sourceId: val.sourceId || null,
                      thumbnailImageUrl: val.thumbnailImageUrl || null,
                    }))
                  : [],
              }))
            : [];

          const variants = product?.variants?.map((variant: any) => {
            const variantId = variant.id;

            let newStocks = variant.stocks || [];
            if (
              updatesMapStock[productId] &&
              updatesMapStock[productId][variantId]
            ) {
              newStocks = newStocks?.map((s: any) => {
                const overrideQty =
                  updatesMapStock[productId][variantId][s.stockLocationId];
                if (overrideQty !== undefined) {
                  return {
                    stockLocationId: s.stockLocationId,
                    stockCount: overrideQty,
                  };
                }
                return {
                  stockLocationId: s.stockLocationId,
                  stockCount: s.stockCount,
                };
              });
            }

            let newPrices = variant.prices || [];
            if (
              updatesMapPrice[productId] &&
              updatesMapPrice[productId][variantId]
            ) {
              const { basePrice, onlinePrice } =
                updatesMapPrice[productId][variantId];

              newPrices = newPrices?.map((p: any) => {
                if (p.priceListId == null && basePrice !== undefined) {
                  return {
                    sellPrice: basePrice,
                    discountPrice: p.discountPrice ?? null,
                    buyPrice: p.buyPrice ?? null,
                    priceListId: null,
                  };
                }
                if (
                  p.priceListId === IkasOnlinePriceListId &&
                  onlinePrice !== undefined
                ) {
                  return {
                    sellPrice: onlinePrice,
                    discountPrice: p.discountPrice ?? null,
                    buyPrice: p.buyPrice ?? null,
                    priceListId: IkasOnlinePriceListId,
                  };
                }
                return {
                  sellPrice: p.sellPrice,
                  discountPrice: p.discountPrice ?? null,
                  buyPrice: p.buyPrice ?? null,
                  priceListId: p.priceListId ?? null,
                };
              });

              if (
                basePrice !== undefined &&
                !variant.prices.some((p: any) => p.priceListId == null)
              ) {
                newPrices.push({
                  sellPrice: basePrice,
                  discountPrice: null,
                  buyPrice: null,
                  priceListId: null,
                });
              }

              if (
                onlinePrice !== undefined &&
                !variant?.prices?.some(
                  (p: any) => p.priceListId === IkasOnlinePriceListId,
                )
              ) {
                newPrices.push({
                  sellPrice: onlinePrice,
                  discountPrice: null,
                  buyPrice: null,
                  priceListId: IkasOnlinePriceListId,
                });
              }
            }

            return {
              ...variant,
              isActive: variant.isActive ?? false,
              prices: newPrices?.map((p: any) => ({
                sellPrice: p.sellPrice,
                discountPrice: p.discountPrice ?? null,
                buyPrice: p.buyPrice ?? null,
                priceListId: p.priceListId ?? null,
              })),
              stocks: newStocks?.map((s: any) => ({
                stockLocationId: s.stockLocationId,
                stockCount: s.stockCount,
              })),
              deleted: false,
            };
          });

          return {
            id: product?.id,
            name: product?.name,
            categories: product?.categories?.map((cat: any) => ({
              name: cat.name,
            })),
            productVariantTypes,
            type: 'PHYSICAL' as const,
            variants,
            deleted: false,
          };
        })
        .filter((input) => input !== null);

      const inputsString = bulkUpdateInputs
        ?.map((input: any) => {
          const productVariantTypesString = input.productVariantTypes
            ?.map((pvt: any) => {
              const variantValuesString = pvt.variantValues
                ?.map(
                  (val: any) =>
                    `{ colorCode: ${
                      val.colorCode ? `"${val.colorCode}"` : 'null'
                    }, name: "${val.name}", sourceId: ${
                      val.sourceId ? `"${val.sourceId}"` : 'null'
                    }, thumbnailImageUrl: ${
                      val.thumbnailImageUrl
                        ? `"${val.thumbnailImageUrl}"`
                        : 'null'
                    } }`,
                )
                .join(', ');
              return `{ order: ${pvt.order}, variantTypeName: ${
                pvt.variantTypeName ? `"${pvt.variantTypeName}"` : 'null'
              }, variantValues: [${variantValuesString}] }`;
            })
            .join(', ');

          const variantsString = input.variants
            ?.map((variant: any) => {
              const pricesString =
                variant.prices && variant.prices.length > 0
                  ? `[${variant.prices
                      ?.map(
                        (p: any) =>
                          `{ sellPrice: ${p.sellPrice}, discountPrice: ${
                            p.discountPrice !== null ? p.discountPrice : 'null'
                          }, buyPrice: ${
                            p.buyPrice !== null ? p.buyPrice : 'null'
                          }, priceListId: ${
                            p.priceListId ? `"${p.priceListId}"` : 'null'
                          } }`,
                      )
                      .join(', ')}]`
                  : '[]';
              const stocksString =
                variant.stocks && variant.stocks.length > 0
                  ? `[${variant.stocks
                      ?.map(
                        (s: any) =>
                          `{ stockCount: ${s.stockCount}, stockLocationId: "${s.stockLocationId}" }`,
                      )
                      .join(', ')}]`
                  : '[]';
              return `{ id: "${variant.id}", isActive: ${variant.isActive}, prices: ${pricesString}, stocks: ${stocksString}, deleted: false, barcodeList:${variant.barcodeList}, hsCode:"${variant.hsCode}", images:${variant.images}, sku:"${variant.sku}", sourceId:"${variant.sourceId}", weight:${variant.weight}}`;
            })
            .join(', ');

          const categoriesString = input.categories
            ?.map((cat: any) => `{ name: "${cat.name}" }`)
            .join(', ');

          return `{
          id: "${input.id}",
          name: "${input.name}",
          categories: [${categoriesString}],
          productVariantTypes: [${productVariantTypesString}],
          type: PHYSICAL,
          variants: [${variantsString}],
          deleted: false
        }`;
        })
        .join(', ');

      const mutation = `
      mutation {
        bulkUpdateProducts(
          input: [${inputsString}]
        )
      }
    `;
      const token = await this.getToken();
      const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
      const response = await this.httpService
        .post(
          apiUrl,
          { query: mutation },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        )
        .toPromise();

      await this.ikasGateway.emitIkasProductStockChanged();
      return response.data;
    } catch (error: any) {
      console.error(
        'Bulk update failed:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'Unable to perform bulk product stock / price update.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
