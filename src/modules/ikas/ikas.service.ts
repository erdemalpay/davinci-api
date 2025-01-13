import { HttpService } from '@nestjs/axios';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationService } from '../location/location.service';
import { MenuItem } from '../menu/item.schema';
import { OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { StockHistoryStatusEnum } from './../accounting/accounting.dto';
import { AccountingService } from './../accounting/accounting.service';
import { MenuService } from './../menu/menu.service';
import { OrderCollectionStatus } from './../order/order.dto';
import { OrderService } from './../order/order.service';
import { IkasGateway } from './ikas.gateway';

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
        throw new Error('Unable to fetch Ikas token');
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

        return response.data.data.listProduct.data;
      } catch (error) {
        console.error(
          'Error fetching products:',
          JSON.stringify(error.response?.data || error.message),
        );
        throw new Error('Unable to fetch products from Ikas.');
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
        throw new Error('Unable to fetch categories from Ikas.');
      }
    };

    return await fetchCategories(); // Fetch and return all categories
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
        throw new Error('Unable to fetch stock locations from Ikas.');
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
        throw new Error('Unable to fetch sales channels from Ikas.');
      }
    };

    return await fetchSalesChannels(); // Fetch and return all sales channels
  }
  async createItemProduct(user: User, item: MenuItem) {
    try {
      const createIkasProductItem = {
        name: item.name,
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
            prices: [{ sellPrice: item.price }],
          },
        ],
        images: [item?.imageUrl, ...(item?.productImages || [])],
      };
      const ikasProduct = await this.createProduct(createIkasProductItem);
      if (ikasProduct) {
        await this.menuService.updateItem(user, item._id, {
          ikasId: ikasProduct.id,
        });
        // TODO :here the stock update needs to be added
      }
    } catch (error) {
      console.error('Failed to create item product:', error);
      throw new Error('Failed to process item product due to an error.');
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
            type: ${productInput.type}, 
            categoryIds: ${JSON.stringify(productInput.categoryIds)}, 
            salesChannelIds: ${JSON.stringify(productInput.salesChannelIds)}, 
            variants: [
              {
                isActive: ${productInput.variants[0].isActive},
                prices: [
                  { sellPrice: ${productInput.variants[0].prices[0].sellPrice} }
                ]
              }
            ]
          }) {
            id
            name
            type
            categoryIds
            salesChannelIds
            variants {
              id
              isActive
              prices {
                sellPrice
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
        throw new Error('Unable to save product to Ikas.');
      }
    };
    const savedProduct = await saveProductMutation();
    if (productInput.images && productInput.images.length > 0) {
      const variantId = savedProduct.variants[0].id;
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
      (product) => product.id === productId,
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
      throw new Error(`Product with ID ${productId} not found`);
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
                variantId: "${foundProduct.variants[0].id}"
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
        throw new Error('Unable to update product stock.');
      }
    };

    return await updateProductStockMutation();
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
        throw new Error('Unable to fetch webhooks from Ikas.');
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
        throw new Error('Unable to save webhook to Ikas.');
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
        throw new Error('Unable to delete webhook from Ikas.');
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
          throw new Error(`Unable to upload image ${i + 1} to Ikas.`);
        }
      }
    };
    await uploadImagesMutation();
  }

  async orderCreateWebHook(data?: any) {
    try {
      if (!data?.merchantId) {
        throw new Error('Invalid request: Missing merchantId');
      }

      if (typeof data?.data === 'string') {
        try {
          data.data = JSON.parse(data.data);
        } catch (error) {
          throw new Error('Invalid JSON format in data');
        }
      }

      console.log('Received data:', data);

      const orderLineItems = data?.data?.orderLineItems ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv'); // Required for stock consumption

      if (!constantUser) {
        throw new Error('Constant user not found');
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
            throw new Error('Invalid order line item data');
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
          const createOrderObject = {
            item: foundMenuItem._id,
            quantity: quantity,
            note: '',
            category: foundMenuItem.category,
            discount: undefined,
            discountNote: '',
            isOnlinePrice: false,
            location: foundLocation._id,
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
          };
          try {
            const order = await this.orderService.createOrder(
              constantUser,
              createOrderObject,
            );
            console.log('Order created:', order);

            const createdCollection = {
              location: foundLocation._id,
              paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
              amount: finalPrice,
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
        throw new Error('Invalid request: Missing merchantId');
      }

      if (typeof data?.data === 'string') {
        try {
          data.data = JSON.parse(data.data);
        } catch (error) {
          throw new Error('Invalid JSON format in data');
        }
      }

      console.log('Received data:', data);

      const orderLineItems = data?.data?.orderLineItems ?? [];
      const constantUser = await this.userService.findByIdWithoutPopulate('dv'); // Required for stock consumption

      if (!constantUser) {
        throw new Error('Constant user not found');
      }
      if (orderLineItems.length === 0) {
        console.log('No order line items to process');
        return;
      }
      if (data?.data?.status !== 'CANCELLED') {
        console.log(`Skipping item as status is not 'CANCELLED'`);
        return;
      }
      for (const orderLineItem of orderLineItems) {
        try {
          const { id } = orderLineItem;
          if (!id) {
            throw new Error('Invalid order line item data');
          }
          await this.orderService.cancelIkasOrder(constantUser, id);
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
              await this.updateProductStock(
                item.ikasId,
                stock.location,
                stock.quantity,
              );
              console.log(
                `Stock updated for product ${item.ikasId}, location ${stock.location}`,
              );
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
}
