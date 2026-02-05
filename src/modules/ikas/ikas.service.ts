import { HttpService } from '@nestjs/axios';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notification/notification.service';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { AccountingService } from './../accounting/accounting.service';
import { MenuService } from './../menu/menu.service';
import { OrderService } from './../order/order.service';

const NEORAMA_DEPO_LOCATION = 6;

interface SeenUsers {
  [key: string]: boolean;
}
type VariantPriceInputLite = {
  productId: string;
  variantId: string;
  price: { currency: string; sellPrice: number; discountPrice?: number | null };
};
const ONLINE_PRICE_LIST_ID = '2ca3e615-516c-4c09-8f6d-6c3183699c21';

@Injectable()
export class IkasService {
  private readonly logger = new Logger(IkasService.name);
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
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly notificationService: NotificationService,
    private readonly visitService: VisitService,
  ) {
    this.tokenPayload = {
      grant_type: 'client_credentials',
      client_id: this.configService.get<string>('IKAS_CLIENT_ID'),
      client_secret: this.configService.get<string>('IKAS_API_SECRET'),
    };
  }

  // isTokenExpired(createdAt: number, expiresIn: number): boolean {
  //   const expiresInMs = expiresIn * 1000;
  //   const currentTime = new Date().getTime();
  //   return currentTime - createdAt > expiresInMs;
  // }

  // async getToken() {
  //   let ikasToken = await this.redisService.get(RedisKeys.IkasToken);
  //   if (
  //     !ikasToken ||
  //     this.isTokenExpired(ikasToken.createdAt, ikasToken.expiresIn)
  //   ) {
  //     const apiUrl = 'https://davinci.myikas.com/api/admin/oauth/token';
  //     await this.redisService.reset(RedisKeys.IkasToken);
  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, this.tokenPayload, {
  //           headers: { 'Content-Type': 'application/json' },
  //         })
  //         .toPromise();
  //       ikasToken = {
  //         token: response.data.access_token,
  //         createdAt: new Date().getTime(),
  //         expiresIn: response.data.expires_in,
  //       };
  //       await this.redisService.set(RedisKeys.IkasToken, ikasToken);

  //       return ikasToken.token;
  //     } catch (error) {
  //       this.logger.error('Error fetching Ikas token:', error.message);
  //       throw new HttpException(
  //         'Unable to fetch Ikas token',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   }
  //   return ikasToken.token;
  // }
  // async getAllProducts() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   // Function to fetch a batch of products
  //   const fetchBatch = async (page: number) => {
  //     const query = {
  //       query: `
  // {
  //   listProduct(pagination: { page: ${page}, limit: 50 }) {
  //     data {
  //       id
  //       name
  //       description
  //       categories{
  //         id
  //         name
  //         }
  //       dynamicPriceListIds
  //       hiddenSalesChannelIds
  //       shortDescription
  //       weight
  //       baseUnit {
  //         type
  //       }
  //       brandId
  //       categoryIds
  //       googleTaxonomyId
  //       salesChannelIds
  //       tagIds
  //       translations {
  //         locale
  //         name
  //         description
  //       }
  //       metaData {
  //         id
  //         canonicals
  //         description
  //         disableIndex
  //         metadataOverrides {
  //           description
  //           language
  //           pageTitle
  //           storefrontId
  //         }
  //         pageTitle
  //         slug
  //         targetType
  //         translations {
  //           locale
  //           description
  //           pageTitle
  //           slug
  //         }
  //       }
  //       productOptionSetId
  //       productVariantTypes {
  //         order
  //         variantTypeId
  //         variantValueIds
  //       }
  //       type
  //       totalStock
  //       variants {
  //         id
  //         attributes {
  //           productAttributeId
  //           productAttributeOptionId
  //           value
  //         }
  //         stocks{
  //           id
  //           productId
  //           stockCount
  //           stockLocationId
  //         }
  //         barcodeList
  //         fileId
  //         hsCode
  //         images {
  //           fileName
  //           imageId
  //           isMain
  //           isVideo
  //           order
  //         }
  //         isActive
  //         prices {
  //           currency
  //           sellPrice
  //           discountPrice
  //           buyPrice
  //           priceListId
  //         }
  //         sku
  //         unit {
  //           type
  //         }
  //         weight
  //       }
  //     }
  //   }
  // }`,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listProduct?.data;
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching products:',
  //         JSON.stringify(error.response?.data || error.message),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch products from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   const allProducts: any[] = [];
  //   let page = 1;
  //   let hasMore = true;

  //   while (hasMore) {
  //     const batch = await fetchBatch(page);

  //     if (batch.length === 0) {
  //       hasMore = false;
  //     } else {
  //       allProducts.push(...batch);
  //       page += 1;
  //     }
  //   }

  //   return allProducts;
  // }

  // /**
  //  * Get a single product by ID from Ikas API
  //  * Only fetches minimal required fields (id and variants.id)
  //  * Uses listProduct query with id filter for better performance
  //  * @param productId - The Ikas product ID
  //  * @returns Product object with id and variants array containing id, or null if not found
  //  */
  // async getProductById(productId: string) {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const query = {
  //     query: `
  //       {
  //         listProduct(id: { eq: "${productId}" }) {
  //           data {
  //             id
  //             variants {
  //               id
  //             }
  //           }
  //         }
  //       }
  //     `,
  //   };

  //   try {
  //     const response = await this.httpService
  //       .post(apiUrl, query, {
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${token}`,
  //         },
  //       })
  //       .toPromise();

  //     const products = response.data.data.listProduct?.data;
  //     // Return the first product if found, or null if not found
  //     return products && products.length > 0 ? products[0] : null;
  //   } catch (error) {
  //     this.logger.error(
  //       'Error fetching product by ID:',
  //       JSON.stringify(error.response?.data || error.message),
  //     );
  //     throw new HttpException(
  //       `Unable to fetch product ${productId} from Ikas.`,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async getAllOrders() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   // Function to fetch a batch of products
  //   const fetchBatch = async (page: number) => {
  //     const query = {
  //       query: `
  // {
  //   listOrder(pagination: { page: ${page}, limit: 50 }) {
  //     data {
  //       id
  //       stockLocationId
  //       branchSessionId
  //       customerId
  //       orderNumber
  //       orderedAt
  //       salesChannelId
  //     }
  //   }
  // }`,
  //     };
  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listOrder.data;
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching orders:',
  //         JSON.stringify(error.response?.data || error.message),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch products from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   const allOrders: any[] = [];
  //   let page = 1;
  //   let hasMore = true;

  //   while (hasMore) {
  //     const batch = await fetchBatch(page);

  //     if (batch.length === 0) {
  //       hasMore = false;
  //     } else {
  //       allOrders.push(...batch);
  //       page += 1;
  //     }
  //   }

  //   return allOrders;
  // }

  // async getAllCategories() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const fetchCategories = async () => {
  //     const query = {
  //       query: `{
  //       listCategory {
  //         id
  //         name
  //         description
  //         parentId
  //         categoryPath
  //       }
  //     }`,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listCategory; // Return the list of categories
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching categories:',
  //         JSON.stringify(error.response?.data || error.message),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch categories from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await fetchCategories(); // Fetch and return all categories
  // }
  // async getAllPriceLists() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const fetchPriceLists = async () => {
  //     const query = {
  //       query: `{
  //         listPriceList {
  //           id
  //           addProductsAutomatically
  //           currency
  //           currencyCode
  //           currencySymbol
  //           name
  //         }
  //       }`,
  //     };
  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listPriceList;
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching price lists:',
  //         JSON.stringify(error.response?.data || error.message),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch price lists from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await fetchPriceLists();
  // }
  // async getAllStockLocations() {
  //   const token = await this.getToken(); // Fetch the authentication token
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const fetchStockLocations = async () => {
  //     const query = {
  //       query: `{
  //       listStockLocation {
  //         address {
  //           address
  //           city {
  //             code
  //             id
  //             name
  //           }
  //           country {
  //             code
  //             id
  //             name
  //           }
  //           district {
  //             code
  //             id
  //             name
  //           }
  //           phone
  //           postalCode
  //           state {
  //             code
  //             id
  //             name
  //           }
  //         }
  //         createdAt
  //         deleted
  //         id
  //         name
  //         type
  //         updatedAt
  //       }
  //     }`,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listStockLocation; // Return the list of stock locations
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching stock locations:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch stock locations from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await fetchStockLocations(); // Fetch and return all stock locations
  // }
  // async getAllSalesChannels() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const fetchSalesChannels = async () => {
  //     const query = {
  //       query: `{
  //         listSalesChannel {
  //           createdAt
  //           deleted
  //           id
  //           name
  //           priceListId
  //           stockLocations {
  //             order
  //           }
  //           paymentGateways {
  //             order
  //           }
  //           type
  //           updatedAt
  //         }
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listSalesChannel; // Return the list of sales channels
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching sales channels:',
  //         JSON.stringify(error.response?.data || error.message),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch sales channels from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await fetchSalesChannels(); // Fetch and return all sales channels
  // }
  // async createItemProduct(user: User, item: MenuItem) {
  //   try {
  //     const createIkasProductItem = {
  //       name: item.name,
  //       description: item.description?.trim() || '-',
  //       type: 'PHYSICAL',
  //       categoryIds: item.productCategories ?? [],
  //       salesChannelIds: [
  //         '9c66aacf-bab6-4189-905b-2c90f404388a',
  //         'a311f416-e485-433f-8589-ed5e334bcc4b',
  //         '38348181-957d-4964-a9e8-81d8cd6482b4',
  //         '2df1fdbd-e6d6-471d-96de-33fad5dfa944',
  //         '9b9a1d9f-2b98-433d-8f58-e56bd169db97',
  //       ],
  //       variants: [
  //         {
  //           isActive: true,
  //           prices: [
  //             {
  //               sellPrice: item.price,
  //               discountPrice: item?.ikasDiscountedPrice ?? null,
  //             },
  //           ],
  //         },
  //       ],
  //       images: [
  //         ...(item.imageUrl ? [item.imageUrl] : []),
  //         ...(Array.isArray(item.productImages) ? item.productImages : []),
  //       ],
  //     };
  //     const ikasProduct = await this.createProduct(createIkasProductItem);
  //     if (ikasProduct) {
  //       const updatedItem = { ...item.toObject(), ikasId: ikasProduct?.id };
  //       await this.menuService.updateItem(user, item._id, updatedItem);
  //       const productStock = await this.accountingService.findProductStock(
  //         item.matchedProduct,
  //       );
  //       const storeStock = productStock.find((stock) => stock.location === 6);
  //       if (storeStock) {
  //         await this.updateProductStock(
  //           ikasProduct?.id,
  //           6,
  //           storeStock.quantity,
  //         );
  //       }
  //     }
  //   } catch (error) {
  //     this.logger.error('Failed to create item product:', error);
  //     throw new HttpException(
  //       'Failed to process item product due to an error.',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }
  // async createProduct(productInput: any) {
  //   // this condition can be removed to test in staging
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
  //   const saveProductMutation = async () => {
  //     const data = {
  //       query: `
  //       mutation {
  //         saveProduct(input: {
  //           name: "${productInput.name}",
  //           description: "${productInput.description}",
  //           type: ${productInput.type},
  //           categoryIds: ${JSON.stringify(productInput.categoryIds)},
  //           salesChannelIds: ${JSON.stringify(productInput.salesChannelIds)},
  //           variants: [
  //             {
  //               isActive: ${productInput.variants[0].isActive},
  //               prices: [
  //                 { sellPrice: ${productInput.variants[0].prices[0].sellPrice},
  //                   discountPrice: ${
  //                     productInput.variants[0].prices[0].discountPrice
  //                   }
  //                 }
  //               ]
  //             }
  //           ]
  //         }) {
  //           id
  //           name
  //           description
  //           type
  //           categoryIds
  //           salesChannelIds
  //           variants {
  //             id
  //             isActive
  //             prices {
  //               sellPrice
  //               discountPrice
  //             }
  //           }
  //         }
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, data, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();
  //       this.logger.log('Product saved successfully:', response.data?.data?.saveProduct?.id);
  //       return response.data.data.saveProduct; // Return the saved product
  //     } catch (error) {
  //       this.logger.error(
  //         'Error saving product:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       throw new HttpException(
  //         'Unable to save product to Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };
  //   const savedProduct = await saveProductMutation();
  //   if (productInput.images && productInput.images.length > 0) {
  //     const variantId = savedProduct?.variants[0].id;
  //     await this.createProductImages(variantId, productInput.images);
  //   }
  //   return savedProduct;
  // }
  // async updateProductStock(
  //   productId: string, //this is the ikas id for the product
  //   stockLocationId: number,
  //   stockCount: number,
  // ): Promise<boolean> {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   let variantId = '';

  //   // get menu item by ikas id
  //   const menuItem = await this.menuService.findByIkasId(productId);
  //   if (menuItem) {
  //     variantId = menuItem.ikasVariantId;
  //   }
  //   if (!variantId) {
  //     // Get only the specific product instead of all products
  //   const foundProduct = await this.getProductById(productId);
  //     if (foundProduct) {
  //       variantId = foundProduct.variants[0].id;
  //     }
  //   }

  //   if (!variantId) {
  //     throw new HttpException(
  //       `Product with ID ${productId} not found or has no variants`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }

  //   const foundStockLocation = await this.locationService.findLocationById(
  //     stockLocationId,
  //   );
  //   if (!foundStockLocation.ikasId) {
  //     this.logger.warn(
  //       `Stock Location with ID ${stockLocationId} does not have ikas id`,
  //     );
  //     return;
  //   }

  //   const updateProductStockMutation = async (): Promise<boolean> => {
  //     const data = {
  //       query: `
  //       mutation {
  //         saveProductStockLocations(input: {
  //           productStockLocationInputs: [
  //             {
  //               productId: "${productId}",
  //               stockCount: ${stockCount},
  //               stockLocationId: "${foundStockLocation.ikasId}",
  //               variantId: "${variantId}"
  //             }
  //           ]
  //         })
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, data, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();
  //       if (response.data.data.saveProductStockLocations) {
  //         this.logger.log('Stock updated successfully.');
  //         await this.websocketGateway.emitIkasProductStockChanged();
  //         return true; // Return true if the mutation succeeds
  //       } else {
  //         this.logger.error('Failed to update stock: Mutation returned false.');
  //         return false; // Return false if the mutation fails
  //       }
  //     } catch (error) {
  //       this.logger.error(
  //         'Error updating stock:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       this.logger.error('Stock update error details:', error);
  //       throw new HttpException(
  //         'Unable to update product stock.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await updateProductStockMutation();
  // }
  // async updateProductImages(itemId: number): Promise<void> {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   const item = await this.menuService.findItemById(itemId);
  //   if (!item) {
  //     throw new HttpException(
  //       `Menu item with ID ${itemId} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  //   if (!item.ikasId) {
  //     throw new HttpException(
  //       `Menu item with ID ${itemId} does not have an Ikas ID`,
  //       HttpStatus.BAD_REQUEST,
  //     );
  //   }
  //   const urls: string[] = [];
  //   if (item.imageUrl) {
  //     urls.push(item.imageUrl);
  //   }
  //   item.productImages?.forEach((url) => urls.push(url));
  //   const all = await this.getAllProducts();
  //   const ikas = all.find((p) => p.id === item.ikasId);
  //   if (!ikas || !ikas.variants.length) {
  //     throw new HttpException(
  //       `Ikas product or variant not found for ID ${item.ikasId}`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  //   const variantId = ikas.variants[0].id;
  //   try {
  //     await this.createProductImages(variantId, urls);
  //     this.logger.log(`Successfully updated images for variant ${variantId}`);
  //   } catch (err) {
  //     this.logger.error(
  //       `Failed to push images for variant ${variantId}:`,
  //       err.response?.data || err.message,
  //     );
  //     throw new HttpException(
  //       'Unable to upload product images.',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async updateProductPrice(
  //   productId: string, //this is the ikas id for the product
  //   newPrice: number,
  // ): Promise<boolean> {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
  //   const allProducts = await this.getAllProducts();

  //   const foundProduct = allProducts.find(
  //     (product) => product?.id === productId,
  //   );
  //   if (!foundProduct) {
  //     throw new HttpException(
  //       `Product with ID ${productId} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  //   const updateProductPriceMutation = async (): Promise<boolean> => {
  //     const data = {
  //       query: `
  //       mutation {
  //         saveVariantPrices(input: {
  //           variantPriceInputs: [
  //             {
  //               price:{
  //                 sellPrice: ${newPrice},
  //     }
  //               productId: "${productId}",
  //               variantId: "${foundProduct?.variants[0]?.id}"
  //             }
  //           ]
  //         })
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, data, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();
  //       if (response.data.data.saveVariantPrices) {
  //         this.logger.log(`ikas ${productId} price updated successfully.`);
  //         await this.websocketGateway.emitIkasProductStockChanged();
  //         return true;
  //       } else {
  //         this.logger.error('Failed to update price: Mutation returned false.');
  //         return false;
  //       }
  //     } catch (error) {
  //       this.logger.error(
  //         'Error updating price:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       this.logger.error('Price update error details:', error);
  //       throw new HttpException(
  //         'Unable to update product price.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await updateProductPriceMutation();
  // }

  // async getAllWebhooks() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const fetchWebhooks = async () => {
  //     const query = {
  //       query: `{
  //       listWebhook {
  //         createdAt
  //         deleted
  //         endpoint
  //         id
  //         scope
  //         updatedAt
  //       }
  //     }`,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, query, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();

  //       return response.data.data.listWebhook; // Return the list of webhooks
  //     } catch (error) {
  //       this.logger.error(
  //         'Error fetching webhooks:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       throw new HttpException(
  //         'Unable to fetch webhooks from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   return await fetchWebhooks(); // Fetch and return all webhooks
  // }

  // async createOrderWebhook() {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const saveWebhookMutation = async () => {
  //     const data = {
  //       query: `
  //       mutation {
  //         saveWebhook(
  //           input: {
  //             scopes: ["store/order/updated"]
  //             endpoint: "https://apiv2.davinciboardgame.com/ikas/order-cancel-webhook"
  //           }
  //         ) {
  //           id
  //           scope
  //         }
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, data, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();
  //       this.logger.log('Webhook saved successfully:', response.data?.data?.saveWebhook?.id);
  //       return response.data.data.saveWebhook; // Return the saved webhook
  //     } catch (error) {
  //       this.logger.error(
  //         'Error saving webhook:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       throw new HttpException(
  //         'Unable to save webhook to Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   const savedWebhook = await saveWebhookMutation();
  //   return savedWebhook;
  // }
  // async deleteWebhook(scopes: string[]) {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const deleteWebhookMutation = async () => {
  //     // Serialize the scopes array into a GraphQL-friendly format
  //     const serializedScopes = JSON.stringify(scopes);

  //     const data = {
  //       query: `
  //       mutation {
  //         deleteWebhook(scopes: ${serializedScopes})
  //       }
  //     `,
  //     };

  //     try {
  //       const response = await this.httpService
  //         .post(apiUrl, data, {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //         })
  //         .toPromise();
  //       this.logger.log('Webhook deleted:', response.data?.data?.deleteWebhook);
  //       return response.data.data.deleteWebhook; // Return the result of deletion
  //     } catch (error) {
  //       this.logger.error(
  //         'Error deleting webhook:',
  //         JSON.stringify(error.response?.data || error.message, null, 2),
  //       );
  //       throw new HttpException(
  //         'Unable to delete webhook from Ikas.',
  //         HttpStatus.INTERNAL_SERVER_ERROR,
  //       );
  //     }
  //   };

  //   const deleteResult = await deleteWebhookMutation();
  //   return deleteResult;
  // }

  // async createProductImages(variantId: string, imageArray: string[]) {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/product/upload/image';

  //   const uploadImagesMutation = async () => {
  //     for (let i = 0; i < imageArray.length; i++) {
  //       const isMain = i === 0;
  //       const imageData = {
  //         productImage: {
  //           variantIds: [variantId],
  //           url: imageArray[i],
  //           order: i.toString(),
  //           isMain: isMain.toString(),
  //         },
  //       };
  //       try {
  //         const response = await this.httpService
  //           .post(apiUrl, imageData, {
  //             headers: {
  //               'Content-Type': 'application/json',
  //               Authorization: `Bearer ${token}`,
  //             },
  //           })
  //           .toPromise();
  //         this.logger.log(`Image ${i + 1} uploaded successfully`);
  //       } catch (error) {
  //         this.logger.error(
  //           `Error uploading image ${i + 1}:`,
  //           JSON.stringify(error.response?.data || error.message, null, 2),
  //         );
  //         throw new HttpException(
  //           `Unable to upload image ${i + 1} to Ikas.`,
  //           HttpStatus.INTERNAL_SERVER_ERROR,
  //         );
  //       }
  //     }
  //   };
  //   await uploadImagesMutation();
  // }

  // async orderCreateWebHook(data?: any) {
  //   try {
  //     if (!data?.merchantId) {
  //       throw new HttpException(
  //         'Invalid request: Missing merchantId',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }

  //     if (typeof data?.data === 'string') {
  //       try {
  //         data.data = JSON.parse(data.data);
  //       } catch (error) {
  //         throw new HttpException(
  //           'Invalid JSON format in data',
  //           HttpStatus.BAD_REQUEST,
  //         );
  //       }
  //     }

  //     this.logger.log('Received order webhook data');

  //     const orderLineItems = data?.data?.orderLineItems ?? [];
  //     const constantUser = await this.userService.findByIdWithoutPopulate('dv');

  //     if (!constantUser) {
  //       throw new HttpException(
  //         'Constant user not found',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }

  //     if (orderLineItems.length === 0) {
  //       this.logger.log('No order line items to process');
  //       return;
  //     }
  //     if (data?.data?.status !== 'CREATED') {
  //       this.logger.log(`Skipping item as status is not 'CREATED'`);
  //       return;
  //     }
  //     for (const orderLineItem of orderLineItems) {
  //       try {
  //         const { quantity, stockLocationId, id, finalPrice } = orderLineItem;
  //         const { productId } = orderLineItem.variant;

  //         if (!productId || !stockLocationId || !quantity) {
  //           throw new HttpException(
  //             'Invalid order line item data',
  //             HttpStatus.BAD_REQUEST,
  //           );
  //         }

  //         const foundMenuItem = await this.menuService.findByIkasId(productId);
  //         if (!foundMenuItem?.matchedProduct) {
  //           this.logger.warn(`Menu item not found for productId: ${productId}`);
  //           continue;
  //         }

  //         const foundLocation = await this.locationService.findByIkasId(
  //           stockLocationId,
  //         );
  //         if (!foundLocation) {
  //           this.logger.warn(
  //             `Location not found for stockLocationId: ${stockLocationId}`,
  //           );
  //           continue;
  //         }

  //         const foundPaymentMethod =
  //           await this.accountingService.findPaymentMethodByIkasId(
  //             data?.data?.salesChannelId,
  //           );
  //         const foundIkasOrder = await this.orderService.findByIkasId(id);
  //         if (foundIkasOrder) {
  //           this.logger.log(
  //             `Order already exists for ikas order id: ${id}, skipping to next item.`,
  //           );
  //           continue;
  //         }
  //         const ikasOrderNumber = data?.data?.orderNumber;
  //         let createOrderObject: CreateOrderDto = {
  //           item: foundMenuItem._id,
  //           quantity: quantity,
  //           note: '',
  //           discount: undefined,
  //           discountNote: '',
  //           isOnlinePrice: false,
  //           location: 4,
  //           unitPrice: finalPrice,
  //           paidQuantity: quantity,
  //           deliveredAt: new Date(),
  //           deliveredBy: constantUser?._id,
  //           preparedAt: new Date(),
  //           preparedBy: constantUser?._id,
  //           status: OrderStatus.AUTOSERVED,
  //           stockLocation: foundLocation._id,
  //           createdAt: new Date(),
  //           tableDate: new Date(),
  //           createdBy: constantUser?._id,
  //           stockNote: StockHistoryStatusEnum.IKASORDERCREATE,
  //           ikasId: id,
  //           ...(foundPaymentMethod && {
  //             paymentMethod: foundPaymentMethod._id,
  //           }),
  //           ...(ikasOrderNumber && {
  //             ikasOrderNumber: ikasOrderNumber,
  //           }),
  //         };
  //         if (data?.data?.stockLocationId) {
  //           const foundLocation = await this.locationService.findByIkasId(
  //             data?.data?.stockLocationId,
  //           );
  //           if (foundLocation) {
  //             createOrderObject = {
  //               ...createOrderObject,
  //               ikasCustomer: {
  //                 id: data?.data?.customer?.id,
  //                 firstName: data?.data?.customer?.firstName,
  //                 lastName: data?.data?.customer?.lastName,
  //                 email: data?.data?.customer?.email,
  //                 phone: data?.data?.customer?.phone,
  //                 location: foundLocation._id,
  //               },
  //             };
  //           }
  //         }
  //         try {
  //           const order = await this.orderService.createOrder(
  //             constantUser,
  //             createOrderObject,
  //           );
  //           this.logger.log(`Order created: ${order._id}`);
  //           if (data?.data?.stockLocationId) {
  //             const foundLocation = await this.locationService.findByIkasId(
  //               data?.data?.stockLocationId,
  //             );
  //             if (foundLocation) {
  //               const visits = await this.visitService.findByDateAndLocation(
  //                 format(order.createdAt, 'yyyy-MM-dd'),
  //                 2,
  //               );
  //               const uniqueVisitUsers =
  //                 visits
  //                   ?.reduce(
  //                     (
  //                       acc: { unique: typeof visits; seenUsers: SeenUsers },
  //                       visit,
  //                     ) => {
  //                       acc.seenUsers = acc.seenUsers || {};
  //                       if (
  //                         visit?.user &&
  //                         !acc.seenUsers[(visit as any).user]
  //                       ) {
  //                         acc.seenUsers[(visit as any).user] = true;
  //                         acc.unique.push(visit);
  //                       }
  //                       return acc;
  //                     },
  //                     { unique: [], seenUsers: {} },
  //                   )
  //                   ?.unique?.map((visit) => visit.user) ?? [];
  //               const message = {
  //                 key: 'IkasPickupOrderArrived',
  //                 params: {
  //                   product: foundMenuItem.name,
  //                 },
  //               };
  //               const notificationEvents =
  //                 await this.notificationService.findAllEventNotifications();

  //               const ikasTakeawayEvent = notificationEvents.find(
  //                 (notification) =>
  //                   notification.event === NotificationEventType.IKASTAKEAWAY,
  //               );

  //               if (ikasTakeawayEvent) {
  //                 await this.notificationService.createNotification({
  //                   type: ikasTakeawayEvent.type,
  //                   createdBy: ikasTakeawayEvent.createdBy,
  //                   selectedUsers: ikasTakeawayEvent.selectedUsers,
  //                   selectedRoles: ikasTakeawayEvent.selectedRoles,
  //                   selectedLocations: ikasTakeawayEvent.selectedLocations,
  //                   seenBy: [],
  //                   event: NotificationEventType.IKASTAKEAWAY,
  //                   message,
  //                 });
  //               }
  //             }
  //           }
  //           const createdCollection = {
  //             location: 4,
  //             paymentMethod: foundPaymentMethod?._id ?? 'kutuoyunual',
  //             amount: finalPrice * quantity,
  //             status: OrderCollectionStatus.PAID,
  //             orders: [
  //               {
  //                 order: order._id,
  //                 paidQuantity: quantity,
  //               },
  //             ],
  //             createdBy: constantUser._id,
  //             tableDate: new Date(),
  //             ikasId: id, //this is ikas order id
  //             ...(ikasOrderNumber && {
  //               ikasOrderNumber: ikasOrderNumber,
  //             }),
  //           };

  //           try {
  //             const collection = await this.orderService.createCollection(
  //               constantUser,
  //               createdCollection,
  //             );
  //             this.logger.log(`Collection created: ${collection._id}`);
  //           } catch (collectionError) {
  //             this.logger.error(
  //               'Error creating collection:',
  //               collectionError?.message || collectionError,
  //             );
  //             this.logger.error('Collection error stack:', collectionError?.stack);
  //             // Don't throw here, continue with next item
  //             // but log the error for debugging
  //           }
  //         } catch (orderError) {
  //           this.logger.error('Error creating order:', orderError?.message || orderError);
  //           this.logger.error('Order error stack:', orderError?.stack);
  //           // Don't throw here, continue with next item
  //           // but log the error for debugging
  //         }
  //       } catch (itemError) {
  //         this.logger.error('Error processing order line item:', itemError?.message || itemError);
  //         this.logger.error('Item error stack:', itemError?.stack);
  //         // Continue with next item instead of crashing
  //       }
  //     }
  //   } catch (error) {
  //     this.logger.error('Error in orderCreateWebHook:', error);
  //     this.logger.error('Error stack:', error?.stack);
  //     // Re-throw the error to ensure it's properly handled
  //     // but wrap it to prevent unhandled rejection
  //     throw new HttpException(
  //       `Error processing webhook: ${error?.message || 'Unknown error'}`,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // async orderCancelWebHook(data?: any) {
  //   try {
  //     if (!data?.merchantId) {
  //       throw new HttpException(
  //         'Invalid request: Missing merchantId',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }

  //     if (typeof data?.data === 'string') {
  //       try {
  //         data.data = JSON.parse(data.data);
  //       } catch (error) {
  //         throw new HttpException(
  //           'Invalid JSON format in data',
  //           HttpStatus.BAD_REQUEST,
  //         );
  //       }
  //     }

  //     this.logger.log('Received order cancel webhook data');

  //     const orderLineItems = data?.data?.orderLineItems ?? [];
  //     const constantUser = await this.userService.findByIdWithoutPopulate('dv'); // Required for stock consumption

  //     if (!constantUser) {
  //       throw new HttpException(
  //         'Constant user not found',
  //         HttpStatus.NOT_FOUND,
  //       );
  //     }
  //     if (orderLineItems.length === 0) {
  //       this.logger.log('No order line items to process');
  //       return;
  //     }
  //     if (!['CANCELLED', 'REFUNDED'].includes(data?.data?.status)) {
  //       this.logger.log(`Skipping item as status is not 'CANCELLED' or 'REFUNDED'`);
  //       return;
  //     }
  //     for (const orderLineItem of orderLineItems) {
  //       try {
  //         const { id } = orderLineItem;
  //         if (!id) {
  //           throw new HttpException(
  //             'Invalid order line item data',
  //             HttpStatus.BAD_REQUEST,
  //           );
  //         }
  //         await this.orderService.cancelIkasOrder(
  //           constantUser,
  //           id,
  //           orderLineItem.quantity,
  //         );
  //       } catch (itemError) {
  //         this.logger.error('Error processing order line item:', itemError.message);
  //       }
  //     }
  //   } catch (error) {
  //     this.logger.error('Error in orderCancelWebHook:', error.message);
  //   }
  // }

  // async updateAllProductStocks() {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   try {
  //     const ikasItems = await this.menuService.getAllIkasItems();
  //     this.logger.log(`Fetched ${ikasItems.length} Ikas Items`);
  //     const ikasProducts = await this.getAllProducts();
  //     this.logger.log(`Fetched ${ikasProducts.length} Ikas Products`);
  //     const locations = await this.locationService.findAllLocations();
  //     this.logger.log(`Fetched ${locations.length} Stock Locations`);
  //     for (const item of ikasItems) {
  //       try {
  //         const productStocks = await this.accountingService.findProductStock(
  //           item.matchedProduct,
  //         );
  //         this.logger.debug(
  //           `Fetched ${productStocks.length} product stocks for ${item.ikasId}`,
  //         );
  //         for (const stock of productStocks) {
  //           try {
  //             if (!item.ikasId) {
  //               this.logger.warn(
  //                 `Product ${item.matchedProduct} does not have an Ikas ID`,
  //               );
  //               continue;
  //             }
  //             const foundIkasProduct = ikasProducts?.find(
  //               (product) => product?.id === item.ikasId,
  //             );
  //             if (!foundIkasProduct) {
  //               this.logger.warn(`Product ${item.ikasId} not found in Ikas`);
  //               continue;
  //             }
  //             const foundLocation = locations?.find(
  //               (location) => location._id === stock.location,
  //             );
  //             if (!foundLocation?.ikasId) {
  //               this.logger.warn(
  //                 `Location ${stock.location} does not have an Ikas ID`,
  //               );
  //               continue;
  //             }
  //             if (
  //               foundIkasProduct?.variants[0]?.stocks[0]?.stockCount !==
  //               stock.quantity
  //             ) {
  //               await this.updateProductStock(
  //                 item.ikasId,
  //                 stock.location,
  //                 stock.quantity,
  //               );
  //               this.logger.log(
  //                 `Stock updated for product ${item.ikasId}, location ${stock.location}`,
  //               );
  //             }
  //           } catch (stockError) {
  //             this.logger.error(
  //               `Error updating stock for product ${item.ikasId}, location ${stock.location}:`,
  //               stockError.message,
  //             );
  //           }
  //         }
  //       } catch (productStockError) {
  //         this.logger.error(
  //           `Error fetching product stocks for ${item.ikasId}:`,
  //           productStockError.message,
  //         );
  //       }
  //     }
  //   } catch (ikasItemsError) {
  //     this.logger.error('Error fetching Ikas items:', ikasItemsError.message);
  //   }
  // }
  // async bulkUpdateAllProductStocks() {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }
  //   try {
  //     const ikasItems = await this.menuService.getAllIkasItems();
  //     const ikasProducts = await this.getAllProducts();
  //     const locations = await this.locationService.findAllLocations();

  //     const ikasLocation =
  //       locations.find((loc) => !!loc.ikasId)?._id || NEORAMA_DEPO_LOCATION;

  //     // Collect all stock updates that need to be made
  //     const stockUpdates: Array<{
  //       productId: string;
  //       variantId: string;
  //       stockLocationId: string;
  //       stockCount: number;
  //     }> = [];

  //     for (const item of ikasItems) {
  //       if (!item.ikasId) continue;
  //       try {
  //         const product = ikasProducts.find((p) => p.id === item.ikasId);
  //         if (!product) {
  //           this.logger.warn(`Product ${item.ikasId} not found in Ikas`);
  //           continue;
  //         }
  //         const productStocks =
  //           await this.accountingService.findProductStockByLocation(
  //             item.matchedProduct,
  //             ikasLocation,
  //           );
  //         for (const stock of productStocks) {
  //           const location = locations.find(
  //             (loc) => loc._id === stock.location,
  //           );
  //           if (!location || !location.ikasId) continue;
  //           const variant = product.variants[0];
  //           if (!variant) {
  //             this.logger.warn(`No variant found for product ${item.ikasId}`);
  //             continue;
  //           }
  //           const currentStock = variant.stocks?.find(
  //             (s: { stockLocationId: string }) =>
  //               s.stockLocationId === location.ikasId,
  //           );
  //           if (!currentStock) continue;
  //           if (currentStock.stockCount !== stock.quantity) {
  //             stockUpdates.push({
  //               productId: item.ikasId,
  //               variantId: variant.id,
  //               stockLocationId: location.ikasId,
  //               stockCount: stock.quantity,
  //             });
  //           }
  //         }
  //       } catch (err) {
  //         this.logger.error(
  //           `Error fetching product stocks for ${item.ikasId}:`,
  //           err.message,
  //         );
  //       }
  //     }

  //     if (stockUpdates.length === 0) {
  //       this.logger.log('No products need a stock update.');
  //       return;
  //     }

  //     this.logger.log(`Updating ${stockUpdates.length} stock entries`);

  //     // Process updates in batches to avoid overwhelming the API
  //     const batchSize = 100;
  //     const token = await this.getToken();
  //     const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //     for (let i = 0; i < stockUpdates.length; i += batchSize) {
  //       const batch = stockUpdates.slice(i, i + batchSize);

  //       const productStockLocationInputs = batch.map((update) => ({
  //         productId: update.productId,
  //         variantId: update.variantId,
  //         stockLocationId: update.stockLocationId,
  //         stockCount: update.stockCount,
  //       }));

  //       const data = {
  //         query: `mutation saveProductStockLocations($input: SaveStockLocationsInput!) {
  //           saveProductStockLocations(input: $input)
  //         }`,
  //         variables: {
  //           input: {
  //             productStockLocationInputs: productStockLocationInputs,
  //           },
  //         },
  //       };

  //       try {
  //         const response = await this.httpService
  //           .post(apiUrl, data, {
  //             headers: {
  //               'Content-Type': 'application/json',
  //               Authorization: `Bearer ${token}`,
  //             },
  //           })
  //           .toPromise();

  //         if (response.data.data.saveProductStockLocations) {
  //           this.logger.log(
  //             `Batch ${Math.floor(i / batchSize) + 1} updated successfully`,
  //           );
  //         } else {
  //           this.logger.error(
  //             `Batch ${Math.floor(i / batchSize) + 1} failed to update`,
  //           );
  //         }
  //       } catch (error) {
  //         this.logger.error(
  //           `Error updating batch ${Math.floor(i / batchSize) + 1}:`,
  //           JSON.stringify(error.response?.data || error.message, null, 2),
  //         );
  //       }
  //     }
  //     this.websocketGateway.emitIkasProductStockChanged();
  //     this.logger.log('Bulk stock update completed');
  //     return { success: true, updatedCount: stockUpdates.length };
  //   } catch (error) {
  //     this.logger.error('Bulk stock update error:', error.response?.data?.errors || error.message);
  //     throw new HttpException(
  //       'Unable to perform bulk product stock update.',
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  // ONLINE_PRICE_LIST_ID = '2ca3e615-516c-4c09-8f6d-6c3183699c21';

  // private async getFirstVariantId(
  //   products: any,
  //   productId: string,
  // ): Promise<string> {
  //   const product = products.find((p) => p.id === productId);
  //   if (!product) {
  //     throw new HttpException(
  //       `Product with ID ${productId} not found`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  //   if (!product.variants || product.variants.length === 0) {
  //     throw new HttpException(
  //       `No variants found for product ID ${productId}`,
  //       HttpStatus.NOT_FOUND,
  //     );
  //   }
  //   return product.variants[0].id;
  // }

  // private async saveVariantPricesForList(
  //   productId: string,
  //   variantId: string,
  //   opts: {
  //     priceListId?: string | null;
  //     sellPrice: number | string;
  //     discountPrice?: number | string | null;
  //     currency?: string;
  //   },
  // ) {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

  //   const sell = Number(opts.sellPrice);
  //   const disc = opts.discountPrice != null ? Number(opts.discountPrice) : null;

  //   const price: any = {
  //     currency: opts.currency ?? 'TRY',
  //     sellPrice: sell,
  //   };
  //   if (disc != null) {
  //     price.discountPrice = disc;
  //   }

  //   const query = `
  //   mutation SavePrices($input: SaveVariantPricesInput!) {
  //     saveVariantPrices(input: $input)
  //   }
  // `;

  //   const input: any = {
  //     variantPriceInputs: [
  //       {
  //         productId,
  //         variantId,
  //         price,
  //       },
  //     ],
  //   };

  //   if (opts.priceListId) {
  //     input.priceListId = opts.priceListId;
  //   }

  //   const variables = { input };

  //   const response = await this.httpService
  //     .post(
  //       apiUrl,
  //       { query, variables },
  //       {
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${token}`,
  //         },
  //       },
  //     )
  //     .toPromise();

  //   return response.data?.data?.saveVariantPrices === true;
  // }

  // async updateVariantPrices(
  //   products: any,
  //   productId: string,
  //   basePrice: number | string,
  //   onlinePrice?: number | string | null,
  //   baseDiscountPrice?: number | string | null,
  //   onlineDiscountPrice?: number | string | null,
  //   currency = 'TRY',
  // ) {
  //   if (process.env.NODE_ENV !== 'production') {
  //     return;
  //   }

  //   const variantId = await this.getFirstVariantId(products, productId);

  //   await this.saveVariantPricesForList(productId, variantId, {
  //     priceListId: null,
  //     sellPrice: basePrice,
  //     discountPrice: baseDiscountPrice ?? null,
  //     currency,
  //   });

  //   if (onlinePrice != null) {
  //     await this.saveVariantPricesForList(productId, variantId, {
  //       priceListId: ONLINE_PRICE_LIST_ID,
  //       sellPrice: onlinePrice,
  //       discountPrice: onlineDiscountPrice ?? null,
  //       currency,
  //     });
  //   }
  // }
  // private variantCache = new Map<string, string>();

  // private async getVariantIdCached(
  //   products: any,
  //   productId: string,
  // ): Promise<string> {
  //   if (this.variantCache.has(productId))
  //     return this.variantCache.get(productId)!;
  //   const id = await this.getFirstVariantId(products, productId);
  //   this.variantCache.set(productId, id);
  //   return id;
  // }

  // private async saveVariantPricesBatch(
  //   variantPriceInputs: VariantPriceInputLite[],
  //   priceListId?: string | null,
  // ): Promise<boolean> {
  //   const token = await this.getToken();
  //   const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';
  //   const query = `
  //     mutation SavePrices($input: SaveVariantPricesInput!) {
  //       saveVariantPrices(input: $input)
  //     }
  //   `;

  //   const input: any = { variantPriceInputs };
  //   if (priceListId) input.priceListId = priceListId;

  //   const { data } = await this.httpService
  //     .post(
  //       apiUrl,
  //       { query, variables: { input } },
  //       {
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${token}`,
  //         },
  //       },
  //     )
  //     .toPromise();
  //   this.logger.debug('Batch save response received');
  //   return data?.data?.saveVariantPrices === true;
  // }

  // private chunk<T>(arr: T[], size: number): T[][] {
  //   const res: T[][] = [];
  //   for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  //   return res;
  // }

  // async bulkUpdatePricesForProducts(
  //   items: Array<{
  //     productId: string;
  //     basePrice?: number | string | null;
  //     onlinePrice?: number | string | null;
  //   }>,
  //   currency = 'TRY',
  // ) {
  //   if (process.env.NODE_ENV !== 'production') return;
  //   const products = await this.getAllProducts();
  //   const normalized = await Promise.all(
  //     items
  //       .filter((item) => products.some((p) => p.id === item.productId))
  //       .map(async (it) => {
  //         const variantId = await this.getVariantIdCached(
  //           products,
  //           it.productId,
  //         );
  //         return {
  //           productId: it.productId,
  //           variantId,
  //           basePrice: it.basePrice != null ? Number(it.basePrice) : null,
  //           onlinePrice: it.onlinePrice != null ? Number(it.onlinePrice) : null,
  //         };
  //       }),
  //   );

  //   const baseInputs: VariantPriceInputLite[] = normalized
  //     .filter((x) => x.basePrice != null)
  //     .map((x) => ({
  //       productId: x.productId,
  //       variantId: x.variantId,
  //       price: {
  //         currency,
  //         sellPrice: x.basePrice as number,
  //       },
  //     }));

  //   const onlineInputs: VariantPriceInputLite[] = normalized
  //     .filter((x) => x.onlinePrice != null)
  //     .map((x) => ({
  //       productId: x.productId,
  //       variantId: x.variantId,
  //       price: {
  //         currency,
  //         sellPrice: x.onlinePrice as number,
  //       },
  //     }));

  //   for (const batch of this.chunk(baseInputs, 3000)) {
  //     await this.saveVariantPricesBatch(batch);
  //   }
  //   for (const batch of this.chunk(onlineInputs, 3000)) {
  //     await this.saveVariantPricesBatch(batch, ONLINE_PRICE_LIST_ID);
  //   }
  // }
}
