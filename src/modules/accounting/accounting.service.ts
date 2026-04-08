import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { FilterQuery, Model, PipelineStage, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { ActivityType } from '../activity/activity.dto';
import { CheckoutService } from '../checkout/checkout.service';
import { HepsiburadaService } from '../hepsiburada/hepsiburada.service';
import { IkasService } from '../ikas/ikas.service';
import { LocationService } from '../location/location.service';
import {
  CreateNotificationDto,
  NotificationEventType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { ShopifyService } from '../shopify/shopify.service';
import { TrendyolService } from '../trendyol/trendyol.service';
import { RoleEnum } from '../user/user.dto';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { dateRanges } from './../../utils/dateRanges';
import { ActivityService } from './../activity/activity.service';
import { AssetService } from './../asset/asset.service';
import { BackInStockService } from './../back-in-stock/back-in-stock.service';
import { MailType } from './../mail/mail.schema';
import { MailService } from './../mail/mail.service';
import { MenuService } from './../menu/menu.service';
import {
  AddMultipleProductAndMenuItemDto,
  ConsumptStockDto,
  CountQueryDto,
  CreateBrandDto,
  CreateCountDto,
  CreateCountListDto,
  CreateExpenseDto,
  CreateExpenseTypeDto,
  CreateMultipleExpenseDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
  CreateProductCategoryDto,
  CreateProductDto,
  CreateProductStockHistoryDto,
  CreateServiceDto,
  CreateStockDto,
  CreateVendorDto,
  ExpenseTypes,
  ExpenseWithoutPaginateFilterType,
  ExpenseWithPaginateFilterType,
  GameExpenseType,
  JoinProductDto,
  PaymentDateFilter,
  StockHistoryFilter,
  StockHistoryStatusEnum,
  StockQueryDto,
  UpdateMultipleProduct,
} from './accounting.dto';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { Expense } from './expense.schema';
import { ExpenseType } from './expenseType.schema';
import { Payment } from './payment.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { Product } from './product.schema';
import { ProductCategory } from './productCategory.schema';
import { ProductStockHistory } from './productStockHistory.schema';
import { Service } from './service.schema';
import { Stock } from './stock.schema';
import { Vendor } from './vendor.schema';

const path = require('path');

type RoleId = number;

type ExpenseTypeId = string;

type StockLocationId = number;

interface RollbackInfo {
  expenseId?: unknown;
  paymentId?: unknown;
  stockDelta?: number;
  stockId?: string;
  stockHistoryId?: unknown;
}

type BulkCreateExpenseError<TDto> = TDto & {
  errorNote: string;
};

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Service.name) private serviceModel: Model<Service>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(Expense.name) private expenseModel: Model<Expense>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(ProductCategory.name)
    private productCategoryModel: Model<ProductCategory>,
    @InjectModel(CountList.name) private countListModel: Model<CountList>,
    @InjectModel(Count.name) private countModel: Model<Count>,
    @InjectModel(PaymentMethod.name)
    private paymentMethodModel: Model<PaymentMethod>,
    @InjectModel(ProductStockHistory.name)
    private productStockHistoryModel: Model<ProductStockHistory>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
    private readonly menuService: MenuService,
    private readonly activityService: ActivityService,
    private readonly checkoutService: CheckoutService,
    private readonly websocketGateway: AppWebSocketGateway,
    @Inject(forwardRef(() => LocationService))
    private readonly locationService: LocationService,
    @Inject(forwardRef(() => IkasService))
    private readonly ikasService: IkasService,
    @Inject(forwardRef(() => ShopifyService))
    private readonly shopifyService: ShopifyService,
    @Inject(forwardRef(() => TrendyolService))
    private readonly trendyolService: TrendyolService,
    @Inject(forwardRef(() => HepsiburadaService))
    private readonly hepsiburadaService: HepsiburadaService,
    private readonly redisService: RedisService,
    private readonly assetService: AssetService,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
    private readonly visitService: VisitService,
    @Inject(forwardRef(() => BackInStockService))
    private readonly backInStockService: BackInStockService,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
  ) {}
  //   Products
  async findAllProducts(user?: User) {
    let products: Product[] | undefined;
    try {
      const redisProducts = await this.redisService.get(
        RedisKeys.AccountingAllProducts,
      );
      if (redisProducts) {
        products = redisProducts as Product[];
      }
    } catch (error) {
      this.logger.error('Failed to retrieve all products from Redis:', error);
    }

    if (!products) {
      try {
        products = await this.productModel.find().exec();
        if (products.length > 0) {
          await this.redisService.set(RedisKeys.AccountingAllProducts, products);
        }
      } catch (error) {
        this.logger.error(
          'Failed to retrieve all products from database:',
          error,
        );
        throw new HttpException(
          'Could not retrieve products',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    return this.applyProductRoleFilter(products, user, 'product');
  }

  private async applyProductRoleFilter(
    products: Product[],
    user: User | undefined,
    page: string,
  ): Promise<Product[]> {
    const forbiddenExpenseTypeIds = await this.getForbiddenExpenseTypeIds(
      user,
      page,
    );
    if (forbiddenExpenseTypeIds.length === 0) return products;
    return products.filter(
      (p) =>
        !p.expenseType?.some((et: string) =>
          forbiddenExpenseTypeIds.includes(et),
        ),
    );
  }
  async findDeletedProducts() {
    return this.productModel.find({ deleted: true });
  }

  async findActiveProducts() {
    try {
      const redisProducts = await this.redisService.get(
        RedisKeys.AccountingProducts,
      );
      if (redisProducts) {
        return redisProducts;
      }
    } catch (error) {
      this.logger.error('Failed to retrieve products from Redis:', error);
    }

    try {
      const products = await this.productModel
        .find({ deleted: { $ne: true } })
        .exec();
      if (products.length > 0) {
        await this.redisService.set(RedisKeys.AccountingProducts, products);
      }
      return products;
    } catch (error) {
      this.logger.error('Failed to retrieve products from database:', error);
      throw new HttpException(
        'Could not retrieve products',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findProductById(id: string) {
    const product = await this.productModel.findOne({ _id: id });
    return product;
  }
  async findProductByName(name: string) {
    const product = await this.productModel.findOne({
      name: name,
    });
    return product;
  }

  async findProductByIkasId(id: string) {
    const product = await this.productModel.findOne({ ikasId: id });
    return product;
  }

  async createProduct(user: User, createProductDto: CreateProductDto) {
    try {
      if (createProductDto?.matchedMenuItem) {
        const products = await this.productModel.find({
          matchedMenuItem: createProductDto.matchedMenuItem,
        });
        if (products) {
          for (const existingProduct of products) {
            await this.productModel.findByIdAndUpdate(existingProduct._id, {
              matchedMenuItem: null,
            });
          }
        }
      }
      const locations = await this.locationService.findStockLocations();
      const newId = usernamify(createProductDto.name);
      const initialBaseQuantities = locations.map((location) => {
        return {
          location: location._id,
          minQuantity: 0,
          maxQuantity: 0,
        };
      });
      const deletedProduct = await this.productModel.findOne({
        _id: newId,
        deleted: true,
      });
      if (deletedProduct) {
        await this.productModel.findByIdAndUpdate(deletedProduct._id, {
          ...createProductDto,
          baseQuantities: initialBaseQuantities,
          deleted: false,
        });
        await this.websocketGateway.emitProductChanged();
        return deletedProduct;
      }

      const product = new this.productModel(createProductDto);
      product._id = newId;

      product.baseQuantities = initialBaseQuantities;
      await product.save();
      if (createProductDto?.matchedMenuItem) {
        await this.menuService.updateProductItem(
          user,
          createProductDto.matchedMenuItem,
          {
            matchedProduct: product._id,
          },
        );
      }
      if (createProductDto?.countList) {
        await this.countListModel.updateMany(
          { _id: { $in: createProductDto.countList } },
          {
            $addToSet: {
              products: {
                product: product._id,
                locations: createProductDto?.locations ?? [],
              },
            },
          },
        );
        this.websocketGateway.emitCountListChanged();
      }

      await this.websocketGateway.emitProductChanged();
      return product;
    } catch (error) {
      throw new HttpException(
        'Failed to create product',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async joinProducts(user: User, JoinProductDto: JoinProductDto) {
    const { stayedProduct, removedProduct } = JoinProductDto;
    const product = await this.productModel.findById(stayedProduct);
    const removedProductDoc = await this.productModel.findById(removedProduct);

    // updating countLists
    const countLists = await this.countListModel.find({
      products: removedProduct,
    });
    for (const countList of countLists) {
      const updatedProducts = countList?.products?.map((countListProduct) =>
        countListProduct.product === removedProduct
          ? { ...countListProduct, product: stayedProduct }
          : countListProduct,
      );
      countList.products = updatedProducts;
      await countList.save();
    }
    this.websocketGateway.emitCountListChanged();

    // updateStocks
    await this.stockModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    this.websocketGateway.emitStockChanged();
    // update invoices
    await this.expenseModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    this.websocketGateway.emitProductChanged();
    //update menu items
    await this.menuService.updateMenuItemProduct(stayedProduct, removedProduct);

    // update product

    product.brand = [
      ...new Set([
        ...product.brand,
        ...removedProductDoc.brand.filter(
          (item) => !product.brand.includes(item),
        ),
      ]),
    ];
    product.vendor = [
      ...new Set([
        ...product.vendor,
        ...removedProductDoc.vendor.filter(
          (item) => !product.vendor.includes(item),
        ),
      ]),
    ];
    product.expenseType = [
      ...new Set([
        ...product.expenseType,
        ...removedProductDoc.expenseType.filter(
          (item) => !product.expenseType.includes(item),
        ),
      ]),
    ];

    // updating the unit price
    const invoices = await this.expenseModel
      .find({ product: stayedProduct })
      .sort({ date: -1 });
    product.unitPrice =
      parseFloat(
        (invoices[0]?.totalExpense / invoices[0]?.quantity).toFixed(4),
      ) ?? 0;
    await product.save();

    // remove product
    await this.productModel.findByIdAndUpdate(removedProduct, {
      deleted: true,
    });
    await this.websocketGateway.emitProductChanged();
    return product;
  }

  async updateProduct(user: User, id: string, updates: UpdateQuery<Product>) {
    const product = await this.productModel.findById(id);
    if (updates?.matchedMenuItem) {
      const products = await this.productModel.find({
        matchedMenuItem: updates?.matchedMenuItem,
        deleted: false,
      });
      if (products) {
        for (const existingProduct of products) {
          await this.productModel.findByIdAndUpdate(existingProduct._id, {
            matchedMenuItem: null,
          });
        }
      }
      if (product.matchedMenuItem !== updates?.matchedMenuItem) {
        if (product?.matchedMenuItem) {
          await this.menuService.updateProductItem(
            user,
            product.matchedMenuItem,
            {
              matchedProduct: null,
            },
          );
        }
        await this.menuService.updateProductItem(
          user,
          updates?.matchedMenuItem,
          {
            matchedProduct: product._id,
          },
        );
      }
    }
    if (updates?.countList !== undefined && updates?.countList !== null) {
      await this.countListModel.updateMany(
        {},
        { $pull: { products: { product: product._id } } },
      );
      if (updates?.countList?.length > 0) {
        await this.countListModel.updateMany(
          { _id: { $in: updates.countList } },
          {
            $push: {
              products: {
                product: product._id,
                locations: updates?.locations ?? [],
              },
            },
          },
        );
      }
      this.websocketGateway.emitCountListChanged();
    }
    const updatedProduct = await this.productModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    await this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_ACCOUNT_PRODUCT,
      product,
      updatedProduct,
    );
    await this.websocketGateway.emitProductChanged();

    return updatedProduct;
  }
  async updateItemProduct(
    user: User,
    id: string,
    updates: UpdateQuery<Product>,
  ) {
    if (updates?.matchedMenuItem) {
      const products = await this.productModel.find({
        matchedMenuItem: updates?.matchedMenuItem,
        deleted: false,
      });
      if (products) {
        for (const existingProduct of products) {
          await this.productModel.findByIdAndUpdate(existingProduct._id, {
            matchedMenuItem: null,
          });
        }
      }
    }
    const updatedProduct = await this.productModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    await this.websocketGateway.emitProductChanged();
    return updatedProduct;
  }

  async removeProduct(user: User, id: string) {
    // await this.checkIsProductRemovable(id);
    // await this.stockModel.deleteMany({ product: id }); // removing the 0 amaount stocks
    const product = await this.productModel.findById(id);

    if (product?.matchedMenuItem) {
      await this.menuService.updateProductItem(user, product.matchedMenuItem, {
        matchedProduct: null,
      });
    }
    product.deleted = true;
    await product.save();
    await this.websocketGateway.emitProductChanged();
    return product;
  }

  async checkIsProductRemovable(id: string) {
    const invoices = await this.expenseModel.find({ product: id });
    const menuItems = await this.menuService.findAllUndeletedItems();
    const stocks = await this.stockModel.find({ product: id });
    const countlists = await this.countListModel.find();

    if (
      menuItems.some((item) =>
        item.itemProduction.some((itemProduct) => itemProduct.product === id),
      )
    ) {
      throw new HttpException(
        'Cannot remove product with menu items',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove product with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (stocks.length > 0) {
      const stockQuantity = stocks.reduce((acc, stock) => {
        return acc + stock.quantity;
      }, 0);
      if (stockQuantity > 0) {
        throw new HttpException(
          'Cannot remove product with stock',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (
      countlists.some((item) =>
        item.products.some((itemProduct) => itemProduct.product === id),
      )
    ) {
      throw new HttpException(
        'Cannot remove product with countlists',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Services
  async findAllServices(user?: User) {
    const forbiddenExpenseTypeIds = await this.getForbiddenExpenseTypeIds(
      user,
      'service',
    );
    if (forbiddenExpenseTypeIds.length === 0) {
      return this.serviceModel.find();
    }
    return this.serviceModel.find({
      expenseType: { $nin: forbiddenExpenseTypeIds },
    });
  }

  async createService(user: User, createServiceDto: CreateServiceDto) {
    const service = new this.serviceModel(createServiceDto);
    service._id = usernamify(service.name);
    await service.save();
    this.websocketGateway.emitServiceChanged();
    return service;
  }

  async updateService(user: User, id: string, updates: UpdateQuery<Service>) {
    const service = await this.serviceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitServiceChanged();
    return service;
  }

  async removeService(user: User, id: string) {
    const invoices = await this.expenseModel.find({ service: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove service with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    const service = await this.serviceModel.findByIdAndRemove(id);
    this.websocketGateway.emitServiceChanged();
    return service;
  }
  //   Expense Types
  findAllExpenseTypes() {
    return this.expenseTypeModel.find();
  }

  async createExpenseType(
    user: User,
    createExpenseTypeDto: CreateExpenseTypeDto,
  ) {
    const expenseType = new this.expenseTypeModel(createExpenseTypeDto);
    expenseType._id = usernamify(expenseType.name);
    await expenseType.save();
    this.activityService.addActivity(
      user,
      ActivityType.CREATE_EXPENSETYPE,
      expenseType,
    );
    this.websocketGateway.emitExpenseTypeChanged();
    return expenseType;
  }

  async updateExpenseType(
    user: User,
    id: string,
    updates: UpdateQuery<ExpenseType>,
  ) {
    const oldExpenseType = await this.expenseTypeModel.findById(id);
    const newExpenseType = await this.expenseTypeModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_EXPENSETYPE,
      oldExpenseType,
      newExpenseType,
    );
    this.websocketGateway.emitExpenseTypeChanged();
    return newExpenseType;
  }

  async removeExpenseType(user: User, id: string) {
    const invoices = await this.expenseModel.find({ expenseType: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove expense type with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    const products = await this.productModel.find({
      expenseType: id,
      deleted: false,
    });
    const services = await this.serviceModel.find({ expenseType: id });
    if (products.length > 0 || services.length > 0) {
      throw new HttpException(
        'Cannot remove expense type with products or services',
        HttpStatus.BAD_REQUEST,
      );
    }
    const expenseType = await this.expenseTypeModel.findByIdAndRemove(id);
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_EXPENSETYPE,
      expenseType,
    );
    this.websocketGateway.emitExpenseTypeChanged();
    return expenseType;
  }
  //   Brands
  findAllBrands() {
    return this.brandModel.find();
  }

  async createBrand(user: User, createBrandDto: CreateBrandDto) {
    const brand = new this.brandModel(createBrandDto);
    brand._id = usernamify(brand.name);
    await brand.save();
    this.activityService.addActivity(user, ActivityType.CREATE_BRAND, brand);
    this.websocketGateway.emitBrandChanged();
    return brand;
  }
  async createMultipleBrand(user: User, createBrandDtos: CreateBrandDto[]) {
    const brandCreationResults = createBrandDtos.map(async (createBrandDto) => {
      try {
        const brand = new this.brandModel(createBrandDto);
        brand._id = usernamify(brand.name);
        await brand.save();
        this.activityService.addActivity(
          user,
          ActivityType.CREATE_BRAND,
          brand,
        );
        return { success: true, brand: brand, error: null };
      } catch (error) {
        this.logger.error('Error creating brand:', error);
        return { success: false, brand: null, error: error };
      }
    });
    const brands = await Promise.all(brandCreationResults);
    const successfulBrands = brands
      .filter((result) => result.success)
      .map((result) => result.brand);
    if (successfulBrands.length > 0) {
      this.websocketGateway.emitBrandChanged();
    }
    return brands;
  }

  async updateBrand(user: User, id: string, updates: UpdateQuery<Brand>) {
    const oldBrand = await this.brandModel.findById(id);
    const newBrand = await this.brandModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_BRAND,
      oldBrand,
      newBrand,
    );
    this.websocketGateway.emitBrandChanged();
    return newBrand;
  }

  async removeBrand(user: User, id: string) {
    const products = await this.productModel.find({
      brand: id,
      deleted: false,
    });
    if (products.length > 0) {
      throw new HttpException(
        'Cannot remove brand with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    const brand = await this.brandModel.findByIdAndRemove(id);
    this.activityService.addActivity(user, ActivityType.DELETE_BRAND, brand);
    this.websocketGateway.emitBrandChanged();
    return brand;
  }

  //   Vendors
  findAllVendors() {
    return this.vendorModel.find();
  }

  async createVendor(user: User, createVendorDto: CreateVendorDto) {
    const vendor = new this.vendorModel(createVendorDto);
    vendor._id = usernamify(vendor.name);
    await vendor.save();
    this.activityService.addActivity(user, ActivityType.CREATE_VENDOR, vendor);
    this.websocketGateway.emitVendorChanged();
    return vendor;
  }

  async updateVendor(user: User, id: string, updates: UpdateQuery<Vendor>) {
    const oldVendor = await this.vendorModel.findById(id);
    const newVendor = await this.vendorModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_VENDOR,
      oldVendor,
      newVendor,
    );
    this.websocketGateway.emitVendorChanged();
    return newVendor;
  }

  async removeVendor(user: User, id: string) {
    const products = await this.productModel.find({
      vendor: id,
      deleted: false,
    });
    const services = await this.serviceModel.find({
      vendor: id,
    });
    if (products.length > 0 || services.length > 0) {
      throw new HttpException(
        'Cannot remove vendor with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    const vendor = await this.vendorModel.findByIdAndRemove(id);
    this.activityService.addActivity(user, ActivityType.DELETE_VENDOR, vendor);
    this.websocketGateway.emitVendorChanged();
    return vendor;
  }

  // Product Category
  findAllProductCategory() {
    return this.productCategoryModel.find();
  }

  async createProductCategory(
    user: User,
    createProductCategoryDto: CreateProductCategoryDto,
  ) {
    const productCategory = new this.productCategoryModel(
      createProductCategoryDto,
    );
    productCategory._id = usernamify(productCategory.name);
    await productCategory.save();
    this.websocketGateway.emitProductCategoryChanged();
    return productCategory;
  }

  async updateProductCategory(
    user: User,
    id: string,
    updates: UpdateQuery<ProductCategory>,
  ) {
    // const oldProductCategory = await this.productCategoryModel.findById(id);
    const newProductCategory =
      await this.productCategoryModel.findByIdAndUpdate(id, updates, {
        new: true,
      });

    this.websocketGateway.emitProductCategoryChanged();
    return newProductCategory;
  }

  async removeProductCategory(user: User, id: string) {
    // TODO : check will be added here before removing
    const productCategory = await this.productCategoryModel.findByIdAndRemove(
      id,
    );
    this.websocketGateway.emitProductCategoryChanged();
    return productCategory;
  }

  // payment methods
  findAllPaymentMethods() {
    return this.paymentMethodModel.find();
  }
  async findPaymentMethodByIkasId(id: string) {
    const paymentMethod = await this.paymentMethodModel.findOne({ ikasId: id });
    return paymentMethod;
  }

  async findPaymentMethodByShopifyId(id: string) {
    const paymentMethod = await this.paymentMethodModel.findOne({
      shopifyId: id,
    });
    return paymentMethod;
  }

  async findPaymentMethodByName(name: string) {
    const paymentMethod = await this.paymentMethodModel.findOne({
      name: name,
    });
    return paymentMethod;
  }

  async createPaymentMethod(
    user: User,
    createPaymentMethodDto: CreatePaymentMethodDto,
  ) {
    const paymentMethod = new this.paymentMethodModel(createPaymentMethodDto);
    paymentMethod._id = usernamify(paymentMethod.name);
    paymentMethod.isConstant = false;
    await paymentMethod.save();
    this.activityService.addActivity(
      user,
      ActivityType.CREATE_PAYMENTMETHOD,
      paymentMethod,
    );
    this.websocketGateway.emitPaymentMethodChanged();
    return paymentMethod;
  }

  async updatePaymentMethod(
    user: User,
    id: string,
    updates: UpdateQuery<PaymentMethod>,
  ) {
    const oldPaymentMethod = await this.paymentMethodModel.findById(id);
    const newPaymentMethod = await this.paymentMethodModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_PAYMENTMETHOD,
      oldPaymentMethod,
      newPaymentMethod,
    );
    this.websocketGateway.emitPaymentMethodChanged();
    return newPaymentMethod;
  }

  async removePaymentMethod(user: User, id: string) {
    const invoices = await this.expenseModel.find({ paymentMethod: id });

    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove payment method with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }

    // check if payment method used in payments
    const payments = await this.paymentModel.find({ paymentMethod: id });
    if (payments.length > 0) {
      throw new HttpException(
        'Cannot remove payment method with payments',
        HttpStatus.BAD_REQUEST,
      );
    }
    const paymentMethod = await this.paymentMethodModel.findByIdAndRemove(id);
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_PAYMENTMETHOD,
      paymentMethod,
    );
    this.websocketGateway.emitPaymentMethodChanged();
    return paymentMethod;
  }

  async createFixedPaymentMethods() {
    const paymentMethod1 = new this.paymentMethodModel({
      name: 'Cash',
      isConstant: true,
    });
    paymentMethod1._id = usernamify(paymentMethod1.name);
    await paymentMethod1.save();
    const paymentMethod2 = new this.paymentMethodModel({
      name: 'Credit Card',
      isConstant: true,
    });
    paymentMethod2._id = usernamify(paymentMethod2.name);
    await paymentMethod2.save();
    const paymentMethod3 = new this.paymentMethodModel({
      name: 'Bank Transfer',
      isConstant: true,
    });
    paymentMethod3._id = usernamify(paymentMethod3.name);
    await paymentMethod3.save();
  }
  // payment
  async findQueryPayments(filter: PaymentDateFilter) {
    let { after, before, date } = filter;
    let startDate: string | null = null;
    if (after) {
      startDate = format(
        new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd',
      );
    }
    if (date && dateRanges[date]) {
      const dr = dateRanges[date]();
      after = dr.after;
      before = dr.before;
      if (after) {
        startDate = format(
          new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
          'yyyy-MM-dd',
        );
      }
    }
    const match: Record<string, unknown> = {};
    match.invoice = null;
    match.serviceInvoice = null;
    if (startDate && before) {
      match.date = { $gte: startDate, $lte: before };
    } else if (startDate) {
      match.date = { $gte: startDate };
    } else if (before) {
      match.date = { $lte: before };
    }
    return this.paymentModel.find(match).sort({ date: -1 }).exec();
  }

  findAllPayments() {
    return this.paymentModel.find().sort({ _id: -1 });
  }

  async createPayment(user: User, createPaymentDto: CreatePaymentDto) {
    const payment = await this.paymentModel.create({
      ...createPaymentDto,
      user: user,
    });
    this.websocketGateway.emitPaymentChanged();
    return payment;
  }

  async updatePayment(id: string, updates: UpdateQuery<Payment>) {
    const newPayment = await this.paymentModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitPaymentChanged();
    return newPayment;
  }

  async removePayment(id: string) {
    const payment = await this.paymentModel.findByIdAndRemove(id);
    this.websocketGateway.emitPaymentChanged();
    return payment;
  }
  // Invoices
  findProductExpenses(product: string) {
    return this.expenseModel.find({ product: product });
  }
  async findAllExpenseWithPagination(
    page: number,
    limit: number,
    filter: ExpenseWithPaginateFilterType,
    user?: User,
  ) {
    const pageNum = page || 1;
    const limitNum = limit || 10;
    let {
      product,
      service,
      type,
      expenseType,
      paymentMethod,
      location,
      brand,
      vendor,
      before,
      after,
      sort,
      asc,
      date,
      search,
      includeAllRecords,
    } = filter;
    const includeAllRecordsStr =
      typeof includeAllRecords === 'boolean'
        ? includeAllRecords.toString()
        : includeAllRecords ?? 'false';
    const shouldIncludeAllRecords =
      includeAllRecordsStr === 'true' || includeAllRecordsStr === '1';
    const skip = (pageNum - 1) * limitNum;
    const productArray = product ? product.split(',') : [];
    const paymentMethodArray = paymentMethod ? paymentMethod.split(',') : [];
    const serviceArray = service ? service.split(',') : [];
    const sortObject = {};
    const regexSearch = search ? new RegExp(usernamify(search), 'i') : null;
    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['_id'] = -1;
    }
    if (date) {
      const dateRange = dateRanges[date];
      if (dateRange) {
        after = dateRange().after;
        before = dateRange().before;
      }
    }
    let searchedPaymentMethodsIds = [];
    let searchedLocationIds = [];
    let searchedExpenses = [];
    let searchProductsIds = [];
    if (search) {
      searchedPaymentMethodsIds = await this.paymentMethodModel
        .find({ name: { $regex: new RegExp(search, 'i') } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      searchedLocationIds = await this.locationService.searchLocationIds(
        search,
      );
      searchProductsIds = await this.productModel
        .find({ name: { $regex: new RegExp(search, 'i') } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      if (Number(search)) {
        searchedExpenses = await this.expenseModel
          .find({
            _id: Number(search),
          })
          .select('_id')
          .then((docs) => docs.map((doc) => doc._id));
      }
    }
    // Role-based expense type filtering
    const expensePageKey = vendor
      ? 'vendor-expense'
      : brand
      ? 'brand-expense'
      : 'expense';
    const forbiddenExpenseTypeIds = await this.getForbiddenExpenseTypeIds(
      user,
      expensePageKey,
    );
    // Combine user-requested expenseType filter and role-based restriction
    const expenseTypeMatchCondition = this.buildExpenseTypeMatchCondition(
      expenseType,
      forbiddenExpenseTypeIds,
    );
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(product && { product: { $in: productArray } }),
          ...(service && { service: { $in: serviceArray } }),
          ...expenseTypeMatchCondition,
          ...(paymentMethod && { paymentMethod: { $in: paymentMethodArray } }),
          ...(brand && { brand: brand }),
          ...(type && { type: type }),
          ...(vendor && { vendor: vendor }),
          ...(after && { date: { $gte: after } }),
          ...(before && { date: { $lte: before } }),
          ...(after && before && { date: { $gte: after, $lte: before } }),
          ...(searchedPaymentMethodsIds.length > 0 && {}),
          ...(regexSearch
            ? {
                $or: [
                  { note: { $regex: new RegExp(search, 'i') } },
                  { type: { $regex: new RegExp(search, 'i') } },
                  { brand: { $regex: regexSearch } },
                  { vendor: { $regex: regexSearch } },
                  { user: { $regex: regexSearch } },
                  { product: { $in: searchProductsIds } },
                  { service: { $regex: regexSearch } },
                  { expenseType: { $regex: regexSearch } },
                  { paymentMethod: { $in: searchedPaymentMethodsIds } },
                  { location: { $in: searchedLocationIds } },
                  { _id: { $in: searchedExpenses } },
                ],
              }
            : {}),
        },
      },
      {
        $sort: sortObject,
      },
      {
        $facet: {
          metadata: [
            { $count: 'total' },
            {
              $addFields: {
                page: pageNum,
                pages: { $ceil: { $divide: ['$total', Number(limitNum)] } },
                generalTotalExpense: { $sum: '$totalExpense' },
              },
            },
          ],
          data: [{ $skip: Number(skip) }, { $limit: Number(limitNum) }],
          totalExpenseSum: [
            {
              $group: {
                _id: null,
                generalTotalExpense: { $sum: '$totalExpense' },
                overallTotalExpense: { $sum: '$totalExpense' },
              },
            },
          ],
        },
      },
      {
        $unwind: '$metadata',
      },
      {
        $unwind: '$totalExpenseSum',
      },
      {
        $project: {
          data: 1,
          totalNumber: '$metadata.total',
          totalPages: '$metadata.pages',
          page: '$metadata.page',
          limit: limitNum,
          generalTotalExpense: '$totalExpenseSum.generalTotalExpense',
          ...(shouldIncludeAllRecords && {
            overallTotalExpense: '$totalExpenseSum.overallTotalExpense',
          }),
        },
      },
    ];

    // Execute the aggregation pipeline
    const results = await this.expenseModel.aggregate(pipeline);

    // If results array is empty, handle it accordingly
    if (!results.length) {
      return {
        data: [],
        totalNumber: 0,
        totalPages: 0,
        page: pageNum,
        limit: limitNum,
        generalTotalExpense: 0,
        ...(shouldIncludeAllRecords && { overallTotalExpense: 0 }),
      };
    }

    // Return the first element of results which contains all required properties
    return results[0];
  }
  async findAllExpenseWithoutPaginationForCheckoutControl(
    filter: ExpenseWithoutPaginateFilterType,
  ) {
    let {
      product,
      service,
      type,
      expenseType,
      paymentMethod,
      location,
      brand,
      vendor,
      before,
      after,
      sort,
      asc,
      date,
    } = filter;
    const productArray = product ? product.split(',') : [];
    const serviceArray = service ? service.split(',') : [];
    const sortObject = {};
    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['_id'] = -1;
    }
    let startDate: string | null = null;
    if (after) {
      startDate = format(
        new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd',
      );
    }
    if (date) {
      const dateRange = dateRanges[date];
      if (dateRange) {
        after = dateRange().after;
        before = dateRange().before;
        if (after) {
          startDate = format(
            new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
            'yyyy-MM-dd',
          );
        }
      }
    }
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(product && { product: { $in: productArray } }),
          ...(service && { service: { $in: serviceArray } }),
          ...(expenseType && { expenseType }),
          ...(paymentMethod && { paymentMethod }),
          ...(brand && { brand }),
          ...(type && { type }),
          ...(vendor && { vendor }),
          ...(startDate && { date: { $gte: startDate } }),
          ...(before && { date: { $lte: before } }),
          ...(startDate &&
            before && { date: { $gte: startDate, $lte: before } }),
        },
      },
      {
        $sort: sortObject,
      },
    ];

    const results = await this.expenseModel.aggregate(pipeline);
    return results;
  }
  async createMultipleExpense(
    user: User,
    createExpenseDto: CreateMultipleExpenseDto[],
  ) {
    const errorDatas: Array<BulkCreateExpenseError<CreateMultipleExpenseDto>> =
      [];
    let anySuccess = false;

    for (const expenseDto of createExpenseDto) {
      const {
        date,
        product,
        expenseType,
        location,
        brand,
        vendor,
        paymentMethod,
        quantity,
        price,
        vat,
        discount,
        isStockIncrement,
        note,
        isAfterCount,
      } = expenseDto;

      try {
        if (quantity == null || price == null) {
          throw new Error('Quantity or price is missing');
        }
        if (!date) {
          throw new Error('Date is missing');
        }

        const foundProduct = await this.productModel.findOne({
          name: product,
          deleted: false,
        });
        if (!foundProduct) throw new Error('Product not found');

        const foundExpenseType = await this.expenseTypeModel.findOne({
          name: expenseType,
        });
        if (!foundExpenseType) throw new Error('Expense type not found');

        const foundLocation = await this.locationService.findByName(location);
        if (!foundLocation) throw new Error('Location not found');

        const foundBrand = brand
          ? await this.brandModel.findOne({ name: brand })
          : null;

        const foundVendor = await this.vendorModel.findOne({ name: vendor });
        if (!foundVendor) throw new Error('Vendor not found');

        const foundPaymentMethod = await this.paymentMethodModel.findOne({
          name: paymentMethod,
        });
        if (!foundPaymentMethod) throw new Error('Payment method not found');

        const normalized = date.replace(/[.\/]/g, '-');
        const parts = normalized.split('-');
        const isoInput =
          parts[0].length === 4 ? normalized : parts.reverse().join('-');
        const adjustedDate = new Date(isoInput).toISOString().slice(0, 10);
        const discountedPrice = discount
          ? Number(price) - (Number(discount) * Number(price)) / 100
          : Number(price);
        const totalExpense =
          discountedPrice + Number(vat) * (discountedPrice / 100);
        const type = ExpenseTypes.STOCKABLE;

        // Update product unit price if this is the latest expense
        const productLastExpense = await this.expenseModel
          .find({ product: foundProduct._id })
          .sort({ date: -1 })
          .limit(1);

        if (
          !productLastExpense[0] ||
          productLastExpense[0]?.date <= adjustedDate
        ) {
          let updatedUnitPrice: number;

          updatedUnitPrice = parseFloat(
            (Number(totalExpense) / Number(quantity)).toFixed(4),
          );

          await this.productModel.findByIdAndUpdate(
            foundProduct._id,
            { $set: { unitPrice: updatedUnitPrice } },
            { new: true },
          );
        }

        const rollback: RollbackInfo = {};

        const expense = await this.expenseModel.create({
          date: adjustedDate,
          product: foundProduct._id,
          expenseType: foundExpenseType._id,
          location: foundLocation._id,
          brand: foundBrand ? foundBrand._id : null,
          vendor: foundVendor._id,
          paymentMethod: foundPaymentMethod._id,
          quantity: Number(quantity),
          vat: Number(vat) ?? 0,
          discount: Number(discount) ?? 0,
          isPaid: true,
          totalExpense: Number(totalExpense),
          note,
          type,
          isAfterCount: isAfterCount ?? true,
          isStockIncrement:
            String(isStockIncrement) === 'true' || isStockIncrement === true,
          user: user._id,
        });
        rollback.expenseId = expense._id;

        if (
          expense.isStockIncrement &&
          expense.type === ExpenseTypes.STOCKABLE
        ) {
          const stockId = usernamify(
            String(expense.product) + String(expense.location),
          );
          rollback.stockId = stockId;
          rollback.stockDelta = Number(expense.quantity);

          const existingStock = await this.stockModel.findById(stockId);
          if (existingStock) {
            const oldQuantity = existingStock.quantity;

            const newStock = await this.stockModel.findByIdAndUpdate(
              stockId,
              { $inc: { quantity: rollback.stockDelta } },
              { new: true },
            );

            this.websocketGateway.emitStockChanged();

            if (rollback.stockDelta !== 0) {
              const stockHist = await this.productStockHistoryModel.create({
                user: user._id,
                product: expense.product,
                location: expense.location,
                change: rollback.stockDelta,
                status: StockHistoryStatusEnum.EXPENSEENTRY,
                currentAmount: oldQuantity,
                createdAt: new Date(),
              });
              rollback.stockHistoryId = stockHist._id;
              this.websocketGateway.emitProductStockHistoryChanged();
            }

            this.updateExternalStocks(
              expense.product,
              expense.location,
              newStock.quantity,
            );

            await this.activityService.addUpdateActivity(
              user,
              ActivityType.UPDATE_STOCK as any,
              existingStock,
              newStock as any,
            );
          } else {
            const stockDoc = new this.stockModel({
              _id: stockId,
              product: expense.product,
              location: expense.location,
              quantity: rollback.stockDelta,
            });
            await stockDoc.save();
            this.websocketGateway.emitStockChanged();

            await this.activityService.addActivity(
              user,
              ActivityType.CREATE_STOCK as any,
              stockDoc as any,
            );

            if (rollback.stockDelta !== 0) {
              const stockHist = await this.productStockHistoryModel.create({
                user: user._id,
                product: expense.product,
                location: expense.location,
                change: rollback.stockDelta,
                status: StockHistoryStatusEnum.EXPENSEENTRY,
                currentAmount: 0,
                createdAt: new Date(),
              });
              rollback.stockHistoryId = stockHist._id;
              this.websocketGateway.emitProductStockHistoryChanged();
            }

            this.updateExternalStocks(
              expense.product,
              expense.location,
              rollback.stockDelta,
            );
          }
        }

        if (expense.isPaid) {
          const payArr = await this.paymentModel.create([
            {
              amount: expense.totalExpense,
              date: expense.date,
              paymentMethod: expense.paymentMethod,
              vendor: expense.vendor,
              invoice: expense._id,
              location: expense.location,
              isAfterCount: expense.isAfterCount,
              user: user._id,
            },
          ]);
          const payment = payArr[0];
          rollback.paymentId = payment._id;
          this.websocketGateway.emitPaymentChanged();
        }
        this.websocketGateway.emitExpenseChanged();
        this.websocketGateway.emitProductChanged();
        this.activityService.addActivity(
          user,
          ActivityType.CREATE_EXPENSE as any,
          expense as any,
        );

        anySuccess = true;
      } catch (e) {
        try {
          if ((e as { rollback?: RollbackInfo })?.rollback?.paymentId) {
            await this.paymentModel.findByIdAndDelete(
              (e as { rollback?: RollbackInfo }).rollback?.paymentId,
            );
          }
        } catch {}

        try {
          if ((e as { rollback?: RollbackInfo })?.rollback?.stockHistoryId) {
            await this.productStockHistoryModel.findByIdAndDelete(
              (e as { rollback?: RollbackInfo }).rollback?.stockHistoryId,
            );
          }
        } catch {}

        try {
          const rb = (e as { rollback?: RollbackInfo })?.rollback;
          if (rb?.stockId && rb?.stockDelta) {
            await this.stockModel.findByIdAndUpdate(
              rb.stockId,
              { $inc: { quantity: -Number(rb.stockDelta) } },
              { new: false },
            );
          }
        } catch {}

        try {
          if ((e as { rollback?: RollbackInfo })?.rollback?.expenseId) {
            await this.expenseModel.findByIdAndDelete(
              (e as { rollback?: RollbackInfo }).rollback?.expenseId,
            );
          }
        } catch {}

        errorDatas.push({
          ...expenseDto,
          errorNote: (e as { message?: string })?.message || 'Error occurred',
        });
      }
    }

    if (anySuccess) {
      this.websocketGateway.emitExpenseChanged();
      this.websocketGateway.emitProductChanged();
      // await this.ikasService.bulkUpdateAllProductStocks();
    }
    return errorDatas;
  }

  async createExpense(
    user: User,
    createExpenseDto: CreateExpenseDto,
    status: string,
    isMultipleCreate?: boolean,
  ) {
    try {
      //update the product unit price
      if (createExpenseDto.type === ExpenseTypes.STOCKABLE) {
        const productLastExpense = await this.expenseModel
          .find({ product: createExpenseDto.product })
          .sort({ date: -1 })
          .limit(1);

        if (
          !productLastExpense[0] ||
          productLastExpense[0]?.date <= createExpenseDto.date
        ) {
          let updatedUnitPrice: number;

          updatedUnitPrice = parseFloat(
            (createExpenseDto.totalExpense / createExpenseDto.quantity).toFixed(
              4,
            ),
          );

          const product = await this.productModel.findByIdAndUpdate(
            createExpenseDto.product,
            { $set: { unitPrice: updatedUnitPrice } },
            { new: true },
          );
          if (!isMultipleCreate) {
            await this.websocketGateway.emitProductChanged();
          }
        }
      }
      //update the service unit price
      else if (createExpenseDto.type === ExpenseTypes.NONSTOCKABLE) {
        const ServiceLastInvoice = await this.expenseModel
          .find({ service: createExpenseDto.service })
          .sort({ date: -1 })
          .limit(1);
        if (
          !ServiceLastInvoice[0] ||
          ServiceLastInvoice[0]?.date <= createExpenseDto.date
        ) {
          const updatedUnitPrice = parseFloat(
            (createExpenseDto.totalExpense / createExpenseDto.quantity).toFixed(
              4,
            ),
          );

          const service = await this.serviceModel.findByIdAndUpdate(
            createExpenseDto.service,
            { $set: { unitPrice: updatedUnitPrice } },
            { new: true },
          );
          this.websocketGateway.emitServiceChanged();
        }
      }

      const expense = await this.expenseModel.create({
        ...createExpenseDto,
        user: user._id,
      });
      if (!isMultipleCreate) {
        this.websocketGateway.emitExpenseChanged();
      }
      if (
        createExpenseDto?.isStockIncrement &&
        createExpenseDto.type === ExpenseTypes.STOCKABLE
      ) {
        // adding expense amount to stock
        await this.createStock(user, {
          product: createExpenseDto.product,
          location: createExpenseDto.location,
          quantity: createExpenseDto.quantity,
          status: status,
        });
      }
      if (createExpenseDto.isPaid) {
        await this.createPayment(user, {
          amount: createExpenseDto.totalExpense,
          date: createExpenseDto.date,
          paymentMethod: createExpenseDto?.paymentMethod,
          vendor: createExpenseDto.vendor,
          ...(createExpenseDto.type === ExpenseTypes.STOCKABLE
            ? { invoice: expense._id }
            : { serviceInvoice: expense._id }),
          location: createExpenseDto.location,
          isAfterCount: createExpenseDto.isAfterCount,
        });
      }
      this.activityService.addActivity(
        user,
        ActivityType.CREATE_EXPENSE,
        expense,
      );
      return expense;
    } catch (error) {
      this.logger.error('Error creating expense:', error);
      throw new HttpException(
        'Expense creation failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async updateExpense(user: User, id: number, updates: UpdateQuery<Expense>) {
    const expense = await this.expenseModel.findById(id);
    if (!expense) {
      throw new HttpException('Expense not found', HttpStatus.BAD_REQUEST);
    }
    if (expense?.totalExpense !== updates?.totalExpense) {
    }
    if (
      expense.type === ExpenseTypes.STOCKABLE &&
      expense.product === updates?.product &&
      expense.quantity === updates?.quantity &&
      expense.location === updates?.location &&
      expense.totalExpense === updates?.totalExpense &&
      expense.date === updates?.date &&
      (expense.note !== updates?.note ||
        expense.brand !== updates?.brand ||
        expense.vendor !== updates?.vendor ||
        expense.expenseType !== updates?.expenseType ||
        expense.paymentMethod !== updates?.paymentMethod ||
        expense?.isStockIncrement !== updates?.isStockIncrement)
    ) {
      const newExpense = await this.expenseModel.findByIdAndUpdate(
        id,
        {
          $set: {
            note: updates?.note,
            brand: updates?.brand,
            vendor: updates?.vendor,
            expenseType: updates?.expenseType,
            paymentMethod: updates?.paymentMethod,
            isStockIncrement: updates?.isStockIncrement,
          },
        },
        { new: true },
      );
      this.websocketGateway.emitExpenseChanged();
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_EXPENSE,
        expense,
        newExpense,
      );
    } else if (
      expense.type === ExpenseTypes.STOCKABLE &&
      expense.product === updates?.product &&
      expense.location === updates?.location &&
      expense.date === updates?.date &&
      expense.totalExpense === updates?.totalExpense &&
      expense.quantity === updates?.quantity &&
      (expense.note !== updates?.note ||
        expense.brand !== updates?.brand ||
        expense.vendor !== updates?.vendor ||
        expense.expenseType !== updates?.expenseType ||
        expense.paymentMethod !== updates?.paymentMethod ||
        expense?.isStockIncrement !== updates?.isStockIncrement)
    ) {
      const newExpense = await this.expenseModel.findByIdAndUpdate(
        id,
        {
          $set: {
            note: updates?.note,
            brand: updates?.brand,
            vendor: updates?.vendor,
            quantity: updates?.quantity,
            expenseType: updates?.expenseType,
            paymentMethod: updates?.paymentMethod,
            isStockIncrement: updates?.isStockIncrement,
          },
        },
        { new: true },
      );
      this.websocketGateway.emitExpenseChanged();
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_EXPENSE,
        expense,
        newExpense,
      );
      if (
        (expense.isStockIncrement || updates?.isStockIncrement) &&
        expense.type === ExpenseTypes.STOCKABLE
      ) {
        await this.createStock(user, {
          product: updates?.product,
          location: updates?.location,
          quantity: updates?.quantity - expense.quantity,
          status: StockHistoryStatusEnum.EXPENSEUPDATE,
        });
      }
    } else {
      await this.removeExpense(
        user,
        id,
        StockHistoryStatusEnum.EXPENSEUPDATEDELETE,
      );
      await this.createExpense(
        user,
        {
          type: expense.type,
          service: updates?.service,
          product: updates?.product,
          expenseType: updates?.expenseType,
          quantity: updates?.quantity,
          totalExpense: updates?.totalExpense,
          location: updates?.location,
          date: updates?.date,
          brand: updates?.brand,
          vendor: updates?.vendor,
          note: updates?.note,
          isPaid: updates?.isPaid,
          paymentMethod: updates?.paymentMethod,
          isAfterCount: updates?.isAfterCount,
          isStockIncrement: updates?.isStockIncrement
            ? updates?.isStockIncrement
            : expense?.isStockIncrement ?? false,
        },
        StockHistoryStatusEnum.EXPENSEUPDATEENTRY,
      );
    }
  }
  async simpleUpdateExpense(
    user: User,
    id: number,
    updates: UpdateQuery<Expense>,
  ) {
    const expense = await this.expenseModel.findById(id);
    if (!expense) {
      throw new HttpException('Expense not found', HttpStatus.BAD_REQUEST);
    }
    const newExpense = await this.expenseModel.findByIdAndUpdate(
      id,
      {
        $set: updates,
      },
      { new: true },
    );
    this.websocketGateway.emitExpenseChanged();
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_EXPENSE,
      expense,
      newExpense,
    );
    return newExpense;
  }

  async removeExpense(user: User, id: number, status: string) {
    const expense = await this.expenseModel.findById(id);
    if (!expense) {
      throw new HttpException('Expense not found', HttpStatus.BAD_REQUEST);
    }
    // removing from the stock in case isStockIncrement is true
    if (expense.type === ExpenseTypes.STOCKABLE && expense.isStockIncrement) {
      await this.createStock(user, {
        product: expense.product,
        location: expense.location,
        quantity: -1 * expense.quantity,
        status: status,
      });
    }
    //remove from the expense
    await this.expenseModel.findByIdAndDelete(id);
    this.websocketGateway.emitExpenseChanged();
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_EXPENSE,
      expense,
    );
    // remove from payments
    if (expense.type === ExpenseTypes.STOCKABLE) {
      await this.paymentModel.deleteMany({ invoice: id });
    } else if (expense.type === ExpenseTypes.NONSTOCKABLE) {
      await this.paymentModel.deleteMany({ serviceInvoice: id });
    }
    this.websocketGateway.emitPaymentChanged();
    // updating the unit price if the expense is stockable
    if (expense.type === ExpenseTypes.STOCKABLE) {
      const product = await this.productModel.findById(expense.product);
      // updating product unit price
      const productStocks = await this.stockModel.find({
        product: expense.product,
      });
      const lastExpense = await this.expenseModel
        .find({ product: expense.product })
        .sort({ date: -1 })
        .limit(1);
      if (productStocks.length > 0) {
        // calculation the stock overall
        const { productStockOverallExpense, productStockOverallTotal } =
          productStocks.reduce(
            (acc, item) => {
              const expense =
                (item.quantity > 0 ? item.quantity : 0) *
                item.product.unitPrice;

              acc.productStockOverallExpense += expense;

              const total = item.quantity > 0 ? item.quantity : 0;
              acc.productStockOverallTotal += total;

              return acc;
            },
            { productStockOverallExpense: 0, productStockOverallTotal: 0 },
          );
        product.unitPrice =
          productStockOverallExpense > 0
            ? parseFloat(
                (
                  (productStockOverallExpense > 0
                    ? productStockOverallExpense
                    : 0) /
                  (productStockOverallTotal > 0 ? productStockOverallTotal : 1)
                ).toFixed(4),
              )
            : lastExpense.length > 0
            ? parseFloat(
                (lastExpense[0].totalExpense / lastExpense[0].quantity).toFixed(
                  4,
                ),
              )
            : 0;
      } else {
        product.unitPrice =
          lastExpense.length > 0
            ? parseFloat(
                (lastExpense[0].totalExpense / lastExpense[0].quantity).toFixed(
                  4,
                ),
              )
            : 0;
      }

      await product.save();
      await this.websocketGateway.emitProductChanged();
    }
    // updating the  service unit price if the expense is non-stockable
    if (expense.type === ExpenseTypes.NONSTOCKABLE) {
      const serviceLastExpense = await this.expenseModel
        .find({ service: expense.service })
        .sort({ date: -1 });
      if (serviceLastExpense[0]?._id === id) {
        await this.serviceModel.findByIdAndUpdate(
          expense.service,
          {
            unitPrice: serviceLastExpense[1]
              ? parseFloat(
                  (
                    serviceLastExpense[1].totalExpense /
                    serviceLastExpense[1].quantity
                  ).toFixed(4),
                )
              : 0,
          },
          {
            new: true,
          },
        );
      }
    }
  }

  // Stocks
  async findAllStocks() {
    try {
      const redisStocks = await this.redisService.get(
        RedisKeys.AccountingStocks,
      );
      if (redisStocks) {
        return redisStocks;
      }
    } catch (error) {
      this.logger.error('Failed to retrieve stocks from Redis:', error);
    }

    try {
      const stocks = await this.stockModel.find();
      if (stocks.length > 0) {
        await this.redisService.set(RedisKeys.AccountingStocks, stocks);
      }
      return stocks;
    } catch (error) {
      this.logger.error('Failed to retrieve stocks from database:', error);
      throw new HttpException(
        'Failed to retrieve stocks from database',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async findProductStock(productId: string) {
    const stocks = await this.stockModel.find({ product: productId });
    return stocks;
  }

  async findProductStockByLocation(productId: string, location: number) {
    const stocks = await this.stockModel.find({
      product: productId,
      location: location,
    });
    return stocks;
  }

  async findQueryStocks(user: User, query: StockQueryDto) {
    const { after, location } = query;
    const filterQuery: Record<string, unknown> = {};
    if (after) {
      filterQuery['createdAt'] = { $gte: new Date(after) };
    }
    const stocks = await this.stockModel.find();
    if (!after) {
      return stocks;
    }
    if (location) {
      filterQuery['location'] = Number(location);
    }
    try {
      let filteredStocks = [];
      const stockHistory = await this.productStockHistoryModel.find(
        filterQuery,
      );
      for (const stock of stocks) {
        const productStockHistory = stockHistory.filter(
          (history) =>
            history.product.toString() === stock.product.toString() &&
            history.location === stock.location,
        );
        let changeSum = productStockHistory.reduce(
          (acc, history) => acc + history.change * -1,
          0,
        );
        if (productStockHistory.length > 0) {
          stock.quantity += changeSum;
        }
        filteredStocks.push({
          _id: stock._id,
          product: stock.product,
          location: Number(stock.location),
          quantity: stock.quantity,
        });
      }
      return filteredStocks;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch and process stocks due to an internal error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findQueryStocksTotalValue(query: StockQueryDto) {
    try {
      const { after, before, location } = query;
      const stockLocation = location ? Number(location) : null;

      const calculateStockValueAtDate = async (targetDate: Date) => {
        // Build match conditions
        const stockMatch: Partial<Record<'location', StockLocationId>> = {};
        if (stockLocation) {
          stockMatch.location = stockLocation as StockLocationId;
        }

        // NOTE: historyMatch was unused; removed to keep types strict.

        // Aggregation pipeline to calculate stock value
        const result = await this.stockModel.aggregate([
          // Match stocks by location if specified
          { $match: stockMatch },
          // Lookup product details
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productDetails',
            },
          },
          {
            $unwind: {
              path: '$productDetails',
              preserveNullAndEmptyArrays: true,
            },
          },
          // Lookup stock history changes after target date
          {
            $lookup: {
              from: 'productstockhistories',
              let: { stockProduct: '$product', stockLocation: '$location' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$product', '$$stockProduct'] },
                        { $eq: ['$location', '$$stockLocation'] },
                        { $gte: ['$createdAt', targetDate] },
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id: null,
                    totalChange: { $sum: { $multiply: ['$change', -1] } },
                  },
                },
              ],
              as: 'historyChanges',
            },
          },
          // Calculate adjusted quantity
          {
            $addFields: {
              adjustedQuantity: {
                $add: [
                  '$quantity',
                  {
                    $ifNull: [
                      { $arrayElemAt: ['$historyChanges.totalChange', 0] },
                      0,
                    ],
                  },
                ],
              },
            },
          },
          // Calculate value for each stock item
          {
            $addFields: {
              stockValue: {
                $multiply: [
                  '$adjustedQuantity',
                  { $ifNull: ['$productDetails.unitPrice', 0] },
                ],
              },
            },
          },
          // Sum all stock values
          {
            $group: {
              _id: null,
              totalValue: { $sum: '$stockValue' },
            },
          },
        ]);

        return result.length > 0 ? result[0].totalValue : 0;
      };

      const afterDate = new Date(after);
      const beforeDate = new Date(
        new Date(before).getTime() + 24 * 60 * 60 * 1000,
      );

      const [afterTotalValue, beforeTotalValue] = await Promise.all([
        calculateStockValueAtDate(afterDate),
        calculateStockValueAtDate(beforeDate),
      ]);

      return { beforeTotalValue, afterTotalValue };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch and process stocks due to an internal error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async fixStockIds() {
    const stocks = await this.stockModel.find().lean();
    for (const stock of stocks) {
      const stockId = usernamify(
        (stock.product as unknown as string) + stock.location,
      );
      if (stockId !== stock._id) {
        try {
          await this.stockModel.create({ ...stock, _id: stockId });
        } catch (error) {
          throw new HttpException(
            'Stock already exists',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.stockModel.findByIdAndRemove(stock._id);
      }
    }
  }
  // async updateIkasStock(productId: string, location: number, quantity: number) {
  //   const menuItem = await this.menuService.findByMatchedProduct(productId);
  //   if (!menuItem || !menuItem.ikasId) {
  //     return;
  //   }
  //   const foundLocation = await this.locationService.findLocationById(location);
  //   if (!foundLocation.ikasId) {
  //     return;
  //   }
  //   await this.ikasService.updateProductStock(
  //     menuItem.ikasId,
  //     location,
  //     quantity,
  //   );
  // }

  async updateShopifyStock(
    productId: string,
    location: number,
    quantity: number,
  ) {
    try {
      const menuItem = await this.menuService.findByMatchedProduct(productId);
      if (!menuItem || !menuItem.shopifyId) {
        return;
      }
      const foundLocation = await this.locationService.findLocationById(
        location,
      );
      if (!foundLocation.shopifyId) {
        return;
      }

      // Get the product variant ID from Shopify
      // We need to get the variant ID from the product
      const shopifyProduct = await this.shopifyService.getProductById(
        menuItem.shopifyId,
      );
      if (!shopifyProduct?.variants?.edges?.[0]?.node?.id) {
        return;
      }

      const variantId = shopifyProduct.variants.edges[0].node.id
        .split('/')
        .pop();

      await this.shopifyService.updateProductStock(
        variantId,
        location,
        quantity,
      );
    } catch (error) {
      // Log error but don't throw - allow main flow to continue
      this.logger.error(
        `Error updating Shopify stock for product ${productId}, location ${location}:`,
        error,
      );
    }
  }

  async updateTrendyolStock(
    productId: string,
    location: number,
    quantity: number,
  ) {
    try {
      const menuItem = await this.menuService.findByMatchedProduct(productId);
      if (!menuItem || !menuItem.trendyolBarcode) {
        return;
      }

      const foundLocation = await this.locationService.findLocationById(
        location,
      );
      if (!foundLocation) {
        return;
      }

      // Trendyol için sadece Online Store location'ı (6) geçerli
      if (location !== 6) {
        return;
      }

      await this.trendyolService.updateProductStock(
        menuItem.trendyolBarcode,
        location,
        quantity,
      );
    } catch (error) {
      // Log error but don't throw - allow main flow to continue
      this.logger.error(
        `Error updating Trendyol stock for product ${productId}, location ${location}:`,
        error,
      );
    }
  }

  updateExternalStocks(productId: string, location: number, quantity: number) {
    this.updateShopifyStock(productId, location, quantity);
    this.updateTrendyolStock(productId, location, quantity);
    this.updateHepsiburadaStock(productId, location, quantity);
  }

  async updateHepsiburadaStock(
    productId: string,
    location: number,
    quantity: number,
  ) {
    try {
      const menuItem = await this.menuService.findByMatchedProduct(productId);
      if (!menuItem || !menuItem.hepsiBuradaSku) {
        return;
      }

      // Hepsiburada için sadece Online Store location'ı (6) geçerli
      if (location !== 6) {
        return;
      }

      await this.hepsiburadaService.updateStockByHbSku(
        menuItem.hepsiBuradaSku,
        quantity,
        menuItem.onlinePrice || menuItem.price || 0,
      );
    } catch (error) {
      this.logger.error(
        `[HB] Error updating Hepsiburada stock for product ${productId}, location ${location}: ${error?.message}`,
      );
      if (error?.response?.data) {
        this.logger.error(
          `[HB] Hepsiburada API response: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      }
    }
  }

  async notifyBackInStockSubscribers(menuItemId: number) {
    try {
      const menuItem = await this.menuService.findItemById(menuItemId);

      if (!menuItem?.shopifyId) {
        return;
      }

      const shopifyProduct = await this.shopifyService.getProductById(
        menuItem.shopifyId,
      );
      const variantId = shopifyProduct?.variants?.edges?.[0]?.node?.id
        ?.split('/')
        .pop();

      if (!variantId) {
        return;
      }

      const subscriptions =
        await this.backInStockService.getActiveSubscriptionsByVariant(
          variantId,
        );

      this.logger.log(
        `Found ${subscriptions.length} back-in-stock subscriptions for variant ${variantId}`,
      );

      for (const subscription of subscriptions) {
        try {
          await this.mailService.sendMail({
            to: subscription.email,
            mailType: MailType.BACK_IN_STOCK,
            variables: {
              productName:
                subscription.productTitle || menuItem?.name || 'Ürün',
              email: subscription.email,
              productUrl: `https://${subscription.shop}${subscription.productUrl}`,
              supportEmail:
                process.env.DEFAULT_FROM_EMAIL || 'info@davinciboardgame.com',
              variantTitle: subscription.variantTitle,
              price: subscription.variantPrice,
              productImage: menuItem?.imageUrl || menuItem?.imageUrl,
            },
            locale: 'tr',
          });

          await this.backInStockService.markAsNotified(subscription._id);

          this.logger.log(
            `Sent back-in-stock notification to ${subscription.email} for product ${menuItem?.name}`,
          );
        } catch (emailError) {
          this.logger.error(
            `Failed to send back-in-stock email to ${subscription.email}:`,
            emailError,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing back-in-stock notifications for menuitem ${menuItemId}:`,
        error,
      );
    }
  }

  async notifyBackInStockSubscribersBulk(menuItemIds: number[]) {
    const results = [];

    for (const menuItemId of menuItemIds) {
      try {
        await this.notifyBackInStockSubscribers(menuItemId);
        results.push({
          menuItemId,
          success: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to process back-in-stock notifications for menu item ${menuItemId}:`,
          error,
        );
        results.push({
          menuItemId,
          success: false,
          error: error.message,
        });
      }
    }

    this.logger.log(
      `Processed bulk back-in-stock notifications for ${menuItemIds.length} menu items`,
    );

    return results;
  }

  async createStock(user: User, createStockDto: CreateStockDto) {
    const stockId = usernamify(
      createStockDto.product + createStockDto?.location,
    );
    const { status, ...stockData } = createStockDto;
    const existingStock = await this.stockModel.findById(stockId);
    if (existingStock) {
      const oldQuantity = existingStock.quantity;
      const newStock = await this.stockModel.findByIdAndUpdate(
        stockId,
        { $inc: { quantity: Number(createStockDto.quantity) } },
        { new: true },
      );

      this.websocketGateway.emitStockChanged();

      if (createStockDto.quantity !== 0) {
        await this.createProductStockHistory(user, {
          user: user._id,
          product: createStockDto.product,
          location: createStockDto.location,
          change: createStockDto.quantity,
          status,
          currentAmount: oldQuantity,
        });
      }

      await this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        existingStock,
        newStock,
      );
      await this.menuService.updateProductVisibilityAfterStockChange(
        createStockDto.product,
        createStockDto.location,
      );

      // // Back-in-stock email notifications for online store
      // if (
      //   createStockDto.location === ONlINESTORELOCATIONID &&
      //   oldQuantity <= 0 &&
      //   newStock.quantity > 0
      // ) {
      //   await this.notifyBackInStockSubscribers(createStockDto.product);
      // }

      if (oldQuantity <= 0 && newStock.quantity > 0) {
        const notificationEvents =
          await this.notificationService.findAllEventNotifications();
        const stockRestoredEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.STOCKRESTORED,
        );

        if (stockRestoredEvent) {
          const foundProduct = await this.findProductById(
            createStockDto.product,
          );
          const locations = await this.locationService.findAllLocations();
          const stockLocation = locations.find(
            (loc) => loc._id === createStockDto.location,
          );

          /*
          // Future enhancement: Notify unique visitors of the day when stock is restored
          const visits = await this.visitService.findByDateAndLocation(
            format(new Date(), 'yyyy-MM-dd'),
            createStockDto.location,
          );
          const uniqueVisitUsers =
            visits
              ?.reduce(
                (acc: { unique: typeof visits; seenUsers: any }, visit) => {
                  acc.seenUsers = acc.seenUsers || {};
                  if (visit?.user && !acc.seenUsers[(visit as any).user]) {
                    acc.seenUsers[(visit as any).user] = true;
                    acc.unique.push(visit);
                  }
                  return acc;
                },
                { unique: [], seenUsers: {} },
              )
              ?.unique?.map((visit) => visit.user) ?? [];
          */

          const message = {
            key: 'StockRestored',
            params: {
              product: foundProduct?.name || 'Unknown',
              location: stockLocation?.name || 'Unknown',
            },
          };

          await this.notificationService.createNotification(
            {
              type: stockRestoredEvent.type,
              createdBy: stockRestoredEvent.createdBy,
              selectedUsers: stockRestoredEvent.selectedUsers,
              selectedRoles: stockRestoredEvent.selectedRoles,
              selectedLocations: stockRestoredEvent.selectedLocations,
              seenBy: [],
              event: NotificationEventType.STOCKRESTORED,
              message,
            },
            user,
          );
        }
      } else if (oldQuantity > 0 && newStock.quantity <= 0) {
        const foundProduct = await this.findProductById(createStockDto.product);
        const locations = await this.locationService.findAllLocations();
        const stockLocation = locations.find(
          (location) => location._id === createStockDto.location,
        );

        const message = {
          key:
            newStock.quantity === 0
              ? 'StockZeroReached'
              : 'StockNegativeReached',
          params: {
            product: foundProduct?.name || 'Unknown',
            location: stockLocation?.name || 'Unknown',
          },
        };

        const notificationEvents =
          await this.notificationService.findAllEventNotifications();
        const zeroNotificationEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.ZEROSTOCK,
        );

        const negativeNotificationEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.NEGATIVESTOCK,
        );

        const selectedEvent =
          newStock.quantity === 0
            ? zeroNotificationEvent
            : negativeNotificationEvent;

        if (selectedEvent) {
          const notificationDto: CreateNotificationDto = {
            type: selectedEvent.type,
            createdBy: selectedEvent.createdBy,
            selectedUsers: selectedEvent.selectedUsers,
            selectedRoles: selectedEvent.selectedRoles,
            selectedLocations: selectedEvent.selectedLocations,
            seenBy: [],
            event:
              newStock.quantity === 0
                ? NotificationEventType.ZEROSTOCK
                : NotificationEventType.NEGATIVESTOCK,
            message,
          };

          await this.notificationService.createNotification(
            notificationDto,
            user,
          );
        }
      }

      // Eğer order IKAS'tan geliyorsa, IKAS zaten kendi stoğunu düşürüyor, tekrar update yapma
      // if (status !== StockHistoryStatusEnum.IKASORDERCREATE) {
      //   this.updateIkasStock(
      //     createStockDto.product,
      //     createStockDto.location,
      //     Number(oldQuantity) + Number(createStockDto.quantity),
      //   );
      // }
      // Eğer order Shopify'dan geliyorsa, Shopify zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.SHOPIFYORDERCREATE) {
        this.updateShopifyStock(
          createStockDto.product,
          createStockDto.location,
          Number(oldQuantity) + Number(createStockDto.quantity),
        );
      }
      // Eğer order Trendyol'dan geliyorsa, Trendyol zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.TRENDYOLORDERCREATE) {
        this.updateTrendyolStock(
          createStockDto.product,
          createStockDto.location,
          Number(oldQuantity) + Number(createStockDto.quantity),
        );
      }
      // Hepsiburada kendi stoğunu otomatik düşürmez, her zaman güncellememiz gerekiyor
      this.updateHepsiburadaStock(
        createStockDto.product,
        createStockDto.location,
        Number(oldQuantity) + Number(createStockDto.quantity),
      );
    } else {
      const stock = new this.stockModel(stockData);
      stock._id = stockId;
      await stock.save();
      this.websocketGateway.emitStockChanged();

      await this.activityService.addActivity(
        user,
        ActivityType.CREATE_STOCK,
        stock,
      );

      if (createStockDto.quantity !== 0) {
        await this.createProductStockHistory(user, {
          user: user._id,
          product: createStockDto.product,
          location: createStockDto.location,
          change: createStockDto.quantity,
          status,
          currentAmount: 0,
        });
      }

      // // Back-in-stock email notifications for new stock in online store
      // if (
      //   createStockDto.location === ONlINESTORELOCATIONID &&
      //   createStockDto.quantity > 0
      // ) {
      //   await this.notifyBackInStockSubscribers(createStockDto.product);
      // }

      if (createStockDto.quantity > 0) {
        const notificationEvents =
          await this.notificationService.findAllEventNotifications();
        const stockRestoredEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.STOCKRESTORED,
        );

        if (stockRestoredEvent) {
          const foundProduct = await this.findProductById(
            createStockDto.product,
          );
          const locations = await this.locationService.findAllLocations();
          const stockLocation = locations.find(
            (loc) => loc._id === createStockDto.location,
          );

          const message = {
            key: 'StockRestored',
            params: {
              product: foundProduct?.name || 'Unknown',
              location: stockLocation?.name || 'Unknown',
            },
          };

          await this.notificationService.createNotification(
            {
              type: stockRestoredEvent.type,
              createdBy: stockRestoredEvent.createdBy,
              selectedUsers: stockRestoredEvent.selectedUsers,
              selectedRoles: stockRestoredEvent.selectedRoles,
              selectedLocations: stockRestoredEvent.selectedLocations,
              seenBy: [],
              event: NotificationEventType.STOCKRESTORED,
              message,
            },
            user,
          );
        }
      }

      // Eğer order IKAS'tan geliyorsa, IKAS zaten kendi stoğunu düşürüyor, tekrar update yapma
      // if (status !== StockHistoryStatusEnum.IKASORDERCREATE) {
      //   this.updateIkasStock(
      //     createStockDto.product,
      //     createStockDto.location,
      //     createStockDto.quantity,
      //   );
      // }
      // Eğer order Shopify'dan geliyorsa, Shopify zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.SHOPIFYORDERCREATE) {
        this.updateShopifyStock(
          createStockDto.product,
          createStockDto.location,
          createStockDto.quantity,
        );
      }
      // Eğer order Trendyol'dan geliyorsa, Trendyol zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.TRENDYOLORDERCREATE) {
        this.updateTrendyolStock(
          createStockDto.product,
          createStockDto.location,
          createStockDto.quantity,
        );
      }
      // Hepsiburada kendi stoğunu otomatik düşürmez, her zaman güncellememiz gerekiyor
      this.updateHepsiburadaStock(
        createStockDto.product,
        createStockDto.location,
        createStockDto.quantity,
      );
    }
    this.websocketGateway.emitStockChanged();
  }

  async updateStock(user: User, id: string, updates: UpdateQuery<Stock>) {
    const stock = await this.stockModel.findById(id);
    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }
    if (
      stock.product === updates?.product &&
      stock.location === updates?.location &&
      stock.quantity !== updates?.quantity
    ) {
      await this.createStock(user, {
        product: updates?.product,
        location: updates?.location,
        quantity: updates?.quantity - stock.quantity,
        status: StockHistoryStatusEnum.STOCKUPDATE,
      });
    } else {
      await this.removeStock(
        user,
        id,
        StockHistoryStatusEnum.STOCKUPDATEDELETE,
      );
      await this.createStock(user, {
        product: updates?.product,
        location: updates?.location,
        quantity: updates?.quantity,
        status: StockHistoryStatusEnum.STOCKUPDATEENTRY,
      });
    }
    // Hepsiburada'ya final stok değerini direkt gönder
    // TO-DO STAGING-HEPSIBURADA'DA SİPARİŞ OLUŞTURDUĞUMDA HB'nin stoğunun düşmediğini gördüm o yüzden bunu koydum, canlıya çıkınca, sipariş oluşturulduğunda HB'de gerçekleşen stok değişimini tekrar incelememiz gerekiyor.
    this.updateHepsiburadaStock(
      updates?.product,
      updates?.location,
      updates?.quantity,
    );
    this.websocketGateway.emitStockChanged();
  }

  async updateStockForStockCountBulk(user: User, currentCountId: number) {
    const counts = await this.countModel.findById(currentCountId);
    if (!counts) {
      throw new HttpException('Count not found', HttpStatus.NOT_FOUND);
    }
    for (const product of counts.products) {
      if (!product?.isStockEqualized) {
        await this.updateStockForStockCount(
          user,
          product.product,
          counts.location,
          product.countQuantity,
          currentCountId,
        );
      }
    }
  }

  async updateStockForStockCount(
    user: User,
    product: string,
    location: number,
    quantity: number,
    currentCountId: number,
  ) {
    const stock = await this.stockModel.findOne({
      product: product,
      location: location,
    });

    const count = await this.countModel.updateOne(
      { _id: currentCountId },
      { $set: { 'products.$[elem].isStockEqualized': true } },
      {
        arrayFilters: [{ 'elem.product': product }],
      },
    );
    this.websocketGateway.emitCountChanged();
    const foundProduct = await this.productModel.findOne({ _id: product });
    if (!foundProduct.deleted) {
      await this.createStock(user, {
        product: product,
        location: location,
        quantity: stock ? quantity - stock.quantity : quantity,
        status: StockHistoryStatusEnum.STOCKEQUALIZE,
      });
    }
  }
  async stockTransfer(
    user: User,
    currentStockLocation: number,
    transferredStockLocation: number,
    product: string,
    quantity: number,
  ) {
    const stock = await this.stockModel.findOne({
      product: product,
      location: currentStockLocation,
    });
    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }
    await this.createStock(user, {
      product: product,
      location: transferredStockLocation,
      quantity: quantity,
      status: StockHistoryStatusEnum.STOCKTRANSFER,
    });
    await this.createStock(user, {
      product: product,
      location: currentStockLocation,
      quantity: -quantity,
      status: StockHistoryStatusEnum.STOCKTRANSFER,
    });
    return stock;
  }
  async removeStock(user: User, id: string, status: string) {
    const stock = await this.stockModel.findById(id).populate('product');

    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Create stock history with status delete
      if (stock.quantity !== 0) {
        await this.createProductStockHistory(user, {
          product: stock.product?._id,
          location: stock.location,
          currentAmount: stock.quantity,
          change: -1 * stock.quantity,
          status: status,
          user: user._id,
        });
      }
      const deletedStock = await this.stockModel.findByIdAndRemove(id);
      // Eğer order IKAS'tan geliyorsa, IKAS zaten kendi stoğunu düşürüyor, tekrar update yapma
      // if (status !== StockHistoryStatusEnum.IKASORDERCREATE) {
      //   this.updateIkasStock(stock.product?._id, stock.location, 0);
      // }
      // Eğer order Shopify'dan geliyorsa, Shopify zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.SHOPIFYORDERCREATE) {
        this.updateShopifyStock(stock.product?._id, stock.location, 0);
      }
      // Eğer order Trendyol'dan geliyorsa, Trendyol zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (status !== StockHistoryStatusEnum.TRENDYOLORDERCREATE) {
        this.updateTrendyolStock(stock.product?._id, stock.location, 0);
      }
      // Hepsiburada kendi stoğunu otomatik düşürmez, her zaman güncellememiz gerekiyor
      this.updateHepsiburadaStock(stock.product?._id, stock.location, 0);
      this.activityService.addActivity(
        user,
        ActivityType.DELETE_STOCK,
        deletedStock,
      );
      await this.menuService.updateProductVisibilityAfterStockChange(
        stock.product?._id,
        stock.location,
      );
      // Remove the stock item
      this.websocketGateway.emitStockChanged();
      return deletedStock;
    } catch (error) {
      throw new HttpException(
        'Failed to remove stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeProductStocks(user: User, id: string) {
    const productStocks = await this.stockModel.find({ product: id });
    const ProductStockHistory = await this.productStockHistoryModel.find({
      product: id,
    });
    for (const stockHistory of ProductStockHistory) {
      await this.productStockHistoryModel.findByIdAndRemove(stockHistory.id);
    }
    this.websocketGateway.emitProductStockHistoryChanged();
    for (const stock of productStocks) {
      await this.stockModel.findByIdAndRemove(stock.id);
    }
    this.websocketGateway.emitStockChanged();
  }

  async consumptStock(user: User, consumptStockDto: ConsumptStockDto) {
    const stock = await this.stockModel.findOne({
      product: consumptStockDto.product,
      location: consumptStockDto.location,
    });
    if (stock) {
      const newStock = await this.stockModel.findByIdAndUpdate(
        stock._id,
        { $inc: { quantity: -consumptStockDto.quantity } },
        { new: true },
      );
      const newQuantity = stock.quantity - consumptStockDto.quantity;
      if (newQuantity <= 0) {
        const foundProduct = await this.findProductById(stock.product as any);
        if (!foundProduct) {
          throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
        }
        await this.menuService.updateProductVisibilityAfterStockChange(
          stock.product as any,
          stock.location,
        );
        const locations = await this.locationService.findAllLocations();
        const stockLocation = locations.find(
          (location) => location._id === stock.location,
        );
        const message = {
          key: newQuantity === 0 ? 'StockZeroReached' : 'StockNegativeReached',
          params: {
            product: foundProduct.name,
            location: stockLocation.name,
          },
        };
        const notificationEvents =
          await this.notificationService.findAllEventNotifications();
        const zeroNotificationEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.ZEROSTOCK,
        );

        const negativeNotificationEvent = notificationEvents.find(
          (notification) =>
            notification.event === NotificationEventType.NEGATIVESTOCK,
        );

        const selectedEvent =
          newQuantity === 0 ? zeroNotificationEvent : negativeNotificationEvent;
        if (
          selectedEvent &&
          selectedEvent.selectedLocations?.includes(stock.location)
        ) {
          const notificationDto: CreateNotificationDto = {
            type: selectedEvent.type,
            createdBy: selectedEvent.createdBy,
            selectedUsers: selectedEvent.selectedUsers,
            selectedRoles: selectedEvent.selectedRoles,
            selectedLocations: selectedEvent.selectedLocations,
            seenBy: [],
            event:
              newQuantity === 0
                ? NotificationEventType.ZEROSTOCK
                : NotificationEventType.NEGATIVESTOCK,
            message,
          };
          await this.notificationService.createNotification(
            notificationDto,
            user,
          );
        }
      }
      const notificationEvents =
        await this.notificationService.findAllEventNotifications();
      const lossProductEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.LOSSPRODUCT,
      );
      if (
        lossProductEvent &&
        consumptStockDto?.status === StockHistoryStatusEnum.LOSSPRODUCT
      ) {
        const locations = await this.locationService.findAllLocations();
        const stockLocation = locations.find(
          (location) => location._id === stock.location,
        );
        const foundProduct = await this.findProductById(stock.product as any);
        if (!foundProduct) {
          throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
        }
        const message = {
          key: 'StockLossRecorded',
          params: {
            quantity: consumptStockDto.quantity,
            product: foundProduct.name,
            location: stockLocation.name,
            unitWord: consumptStockDto.quantity === 1 ? 'unit' : 'units',
          },
        };

        const notificationDto: CreateNotificationDto = {
          type: lossProductEvent.type,
          createdBy: lossProductEvent.createdBy,
          selectedUsers: lossProductEvent.selectedUsers,
          selectedRoles: lossProductEvent.selectedRoles,
          selectedLocations: lossProductEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.LOSSPRODUCT,
          message,
        };

        await this.notificationService.createNotification(
          notificationDto,
          user,
        );
      }
      if (consumptStockDto.quantity !== 0) {
        await this.createProductStockHistory(user, {
          user: user._id,
          product: consumptStockDto.product,
          location: consumptStockDto.location,
          change: -consumptStockDto.quantity,
          status:
            consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION,
          currentAmount:
            consumptStockDto.quantity > 0
              ? Number(newStock.quantity) + Number(consumptStockDto.quantity)
              : stock.quantity,
        });
      }
      this.websocketGateway.emitStockChanged();
      // Activity logging - fire and forget (non-blocking)
      this.activityService
        .addUpdateActivity(user, ActivityType.UPDATE_STOCK, stock, newStock)
        .catch((error) => {
          this.logger.error('Error adding update stock activity:', error);
        });
      const consumptStatus =
        consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION;
      // Eğer order IKAS'tan geliyorsa, IKAS zaten kendi stoğunu düşürüyor, tekrar update yapma
      // if (consumptStatus !== StockHistoryStatusEnum.IKASORDERCREATE) {
      //   this.updateIkasStock(
      //     consumptStockDto.product,
      //     stock.location,
      //     stock.quantity - consumptStockDto.quantity,
      //   );
      // }
      // Eğer order Shopify'dan geliyorsa, Shopify zaten kendi stoğunu düşürüyor, tekrar update yapma
      // Update Shopify stock in background (fire and forget) to avoid blocking
      if (consumptStatus !== StockHistoryStatusEnum.SHOPIFYORDERCREATE) {
        this.updateShopifyStock(
          consumptStockDto.product,
          stock.location,
          stock.quantity - consumptStockDto.quantity,
        ).catch((error) => {
          this.logger.error(
            `Error updating Shopify stock in background: ${error?.message}`,
          );
        });
      }
      // Eğer order Trendyol'dan geliyorsa, Trendyol zaten kendi stoğunu düşürüyor, tekrar update yapma
      if (consumptStatus !== StockHistoryStatusEnum.TRENDYOLORDERCREATE) {
        this.updateTrendyolStock(
          consumptStockDto.product,
          stock.location,
          stock.quantity - consumptStockDto.quantity,
        );
      }
      // Hepsiburada kendi stoğunu otomatik düşürmez, her zaman güncellememiz gerekiyor
      this.updateHepsiburadaStock(
        consumptStockDto.product,
        stock.location,
        stock.quantity - consumptStockDto.quantity,
      );
      return stock;
    } else {
      const newStock = await this.createStock(user, {
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        quantity: -consumptStockDto.quantity,
        status: consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION,
      });
      return newStock;
    }
  }
  // Product Stock History
  async findAllProductStockHistories(
    page: number,
    limit: number,
    filter: StockHistoryFilter,
  ) {
    const pageNum = page || 1;
    const limitNum = limit || 10;
    const {
      product,
      expenseType,
      category,
      location,
      status,
      date,
      before,
      after,
      sort,
      asc,
      vendor,
      brand,
      search,
    } = filter;
    const skip = (pageNum - 1) * limitNum;
    const productArray = product ? String(product).split(',') : [];
    const statusArray = status ? String(status).split(',') : [];
    const categoryArray = category
      ? String(category).split(',').map(Number)
      : [];
    const sortObject = {};
    const regexSearch = search ? new RegExp(usernamify(search), 'i') : null;
    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['createdAt'] = -1;
    }

    let searchedLocationIds = [];
    let searchedUserIds = [];
    let searchedStatuses = [];
    if (search) {
      searchedLocationIds = await this.locationService.searchLocationIds(
        search,
      );
      searchedUserIds = await this.userService.searchUserIds(search);

      // Search in status enum values
      const allStatuses = Object.values(StockHistoryStatusEnum);
      searchedStatuses = allStatuses.filter((statusValue) =>
        statusValue.toLowerCase().includes(search.toLowerCase()),
      );
    }

    // Date filtering logic
    const matchFilter: Record<string, unknown> = {};
    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      matchFilter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, unknown> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        matchFilter.createdAt = rangeFilter;
      }
    }

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      {
        $unwind: '$productDetails',
      },
      {
        $lookup: {
          from: 'menuitems',
          localField: 'productDetails.matchedMenuItem',
          foreignField: '_id',
          as: 'matchedMenuItemDetails',
        },
      },
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(status && {
            status: { $in: statusArray },
          }),
          ...(product && { product: { $in: productArray } }),
          ...(expenseType && {
            'productDetails.expenseType': { $in: [expenseType] },
          }),
          ...(vendor && {
            'productDetails.vendor': { $in: [vendor] },
          }),
          ...(brand && {
            'productDetails.brand': { $in: [brand] },
          }),
          ...(category &&
            categoryArray.length > 0 && {
              'matchedMenuItemDetails.category': { $in: categoryArray },
            }),
          ...matchFilter,
          ...(regexSearch
            ? {
                $or: [
                  { product: { $regex: regexSearch } },
                  { user: { $in: searchedUserIds } },
                  { location: { $in: searchedLocationIds } },
                  ...(searchedStatuses.length > 0
                    ? [{ status: { $in: searchedStatuses } }]
                    : []),
                ],
              }
            : {}),
        },
      },
      {
        $sort: sortObject,
      },
      {
        $facet: {
          metadata: [
            { $count: 'total' },
            {
              $addFields: {
                page: pageNum,
                pages: { $ceil: { $divide: ['$total', Number(limitNum)] } },
              },
            },
          ],
          data: [{ $skip: Number(skip) }, { $limit: Number(limitNum) }],
        },
      },
      {
        $unwind: '$metadata',
      },
      {
        $project: {
          data: 1,
          totalNumber: '$metadata.total',
          totalPages: '$metadata.pages',
          page: '$metadata.page',
          limit: limitNum,
        },
      },
    ];

    // Execute the aggregation pipeline
    const results = await this.productStockHistoryModel.aggregate(pipeline);

    // If results array is empty, handle it accordingly
    if (!results.length) {
      return {
        data: [],
        totalNumber: 0,
        totalPages: 0,
        page: pageNum,
        limit: limitNum,
      };
    }

    return results[0];
  }

  async findAggregatedProductStockHistory(
    page: number,
    limit: number,
    filter: StockHistoryFilter,
  ) {
    const pageNum = page || 1;
    const limitNum = limit || 10;
    const {
      product,
      expenseType,
      category,
      location,
      status,
      date,
      before,
      after,
      sort,
      asc,
      vendor,
      brand,
      search,
    } = filter;
    const skip = (pageNum - 1) * limitNum;
    const productArray = product ? String(product).split(',') : [];
    const statusArray = status ? String(status).split(',') : [];
    const categoryArray = category
      ? String(category).split(',').map(Number)
      : [];
    const sortObject = {};
    const regexSearch = search ? new RegExp(usernamify(search), 'i') : null;

    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['totalChange'] = -1;
    }

    let searchedLocationIds = [];
    let searchedUserIds = [];
    let searchedStatuses = [];
    if (search) {
      searchedLocationIds = await this.locationService.searchLocationIds(
        search,
      );
      searchedUserIds = await this.userService.searchUserIds(search);

      // Search in status enum values
      const allStatuses = Object.values(StockHistoryStatusEnum);
      searchedStatuses = allStatuses.filter((statusValue) =>
        statusValue.toLowerCase().includes(search.toLowerCase()),
      );
    }

    // Date filtering logic
    const matchFilter: Record<string, unknown> = {};
    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      matchFilter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, unknown> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        matchFilter.createdAt = rangeFilter;
      }
    }

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      {
        $unwind: '$productDetails',
      },
      {
        $lookup: {
          from: 'menuitems',
          localField: 'productDetails.matchedMenuItem',
          foreignField: '_id',
          as: 'matchedMenuItemDetails',
        },
      },
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(status && {
            status: { $in: statusArray },
          }),
          ...(product && { product: { $in: productArray } }),
          ...(expenseType && {
            'productDetails.expenseType': { $in: [expenseType] },
          }),
          ...(vendor && {
            'productDetails.vendor': { $in: [vendor] },
          }),
          ...(brand && {
            'productDetails.brand': { $in: [brand] },
          }),
          ...(category &&
            categoryArray.length > 0 && {
              'matchedMenuItemDetails.category': { $in: categoryArray },
            }),
          ...matchFilter,
          ...(regexSearch
            ? {
                $or: [
                  { product: { $regex: regexSearch } },
                  { user: { $in: searchedUserIds } },
                  { location: { $in: searchedLocationIds } },
                  ...(searchedStatuses.length > 0
                    ? [{ status: { $in: searchedStatuses } }]
                    : []),
                ],
              }
            : {}),
        },
      },
      {
        $group: {
          _id: {
            product: '$product',
            location: '$location',
          },
          productDetails: { $first: '$productDetails' },
          matchedMenuItemDetails: { $first: '$matchedMenuItemDetails' },
          totalChange: { $sum: '$change' },
          entryCount: { $sum: 1 },
          firstEntry: { $min: '$createdAt' },
          lastEntry: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          product: '$_id.product',
          location: '$_id.location',
          productDetails: 1,
          matchedMenuItemDetails: 1,
          totalChange: 1,
          entryCount: 1,
          firstEntry: 1,
          lastEntry: 1,
        },
      },
      {
        $sort: sortObject,
      },
      {
        $facet: {
          metadata: [
            { $count: 'total' },
            {
              $addFields: {
                page: pageNum,
                pages: { $ceil: { $divide: ['$total', Number(limitNum)] } },
              },
            },
          ],
          data: [{ $skip: Number(skip) }, { $limit: Number(limitNum) }],
        },
      },
      {
        $unwind: '$metadata',
      },
      {
        $project: {
          data: 1,
          totalNumber: '$metadata.total',
          totalPages: '$metadata.pages',
          page: '$metadata.page',
          limit: limitNum,
        },
      },
    ];

    // Execute the aggregation pipeline
    const results = await this.productStockHistoryModel.aggregate(pipeline);

    // If results array is empty, handle it accordingly
    if (!results.length) {
      return {
        data: [],
        totalNumber: 0,
        totalPages: 0,
        page: pageNum,
        limit: limitNum,
      };
    }

    return results[0];
  }

  async createProductStockHistory(
    user: User,
    createProductStockHistoryDto: CreateProductStockHistoryDto,
  ) {
    const productStockHistory = await new this.productStockHistoryModel({
      ...createProductStockHistoryDto,
      createdAt: new Date(),
    });
    this.websocketGateway.emitProductStockHistoryChanged();
    return productStockHistory.save();
  }
  async updateProductStockHistory(
    user: User,
    id: string,
    updates: UpdateQuery<ProductStockHistory>,
  ) {
    let productStockHistory = await this.productStockHistoryModel.findById(id);
    if (
      updates?.status &&
      [
        StockHistoryStatusEnum.CONSUMPTIONCANCEL,
        StockHistoryStatusEnum.LOSSPRODUCTCANCEL,
        StockHistoryStatusEnum.LOSSPRODUCT,
        StockHistoryStatusEnum.CONSUMPTION,
      ].includes(updates?.status)
    ) {
      await this.createStock(user, {
        product: productStockHistory.product,
        location: productStockHistory.location,
        quantity: -1 * productStockHistory.change,
        status: updates.status,
      });
    } else {
      productStockHistory =
        await this.productStockHistoryModel.findByIdAndUpdate(id, updates, {
          new: true,
        });
    }
    await this.websocketGateway.emitProductStockHistoryChanged();
    return productStockHistory;
  }

  async getGameBatchesWithFIFO(location?: number) {
    const gameProducts = await this.productModel
      .find({
        expenseType: GameExpenseType,
      })
      .select('_id')
      .exec();

    if (!gameProducts?.length) return [];

    const productIds = gameProducts.map((p) => p._id);

    // Single query to get all stock history
    const allStockHistory = await this.productStockHistoryModel
      .find({
        product: { $in: productIds },
        ...(location && { location }),
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    if (!allStockHistory?.length) return [];

    // Group by product and determine batch starts based on running stock
    const batchStartsByProduct = new Map<string, any[]>();
    const stockHistoryByProduct = new Map<string, any[]>();
    const runningStockByProduct = new Map<string, number>();

    for (const sh of allStockHistory) {
      const productId = sh.product;

      // Add to stockHistoryByProduct
      if (!stockHistoryByProduct.has(productId)) {
        stockHistoryByProduct.set(productId, []);
        runningStockByProduct.set(productId, 0);
      }
      stockHistoryByProduct.get(productId)!.push(sh);

      const currentStock = runningStockByProduct.get(productId)!;

      // Check if this is a batch start
      if (sh.change > 0) {
        // EXPENSEENTRY always creates a new batch
        if (sh.status === StockHistoryStatusEnum.EXPENSEENTRY) {
          if (!batchStartsByProduct.has(productId)) {
            batchStartsByProduct.set(productId, []);
          }
          batchStartsByProduct.get(productId)!.push(sh);
        }
        // Any other positive increase: only create batch if stock <= 0
        else if (currentStock <= 0) {
          if (!batchStartsByProduct.has(productId)) {
            batchStartsByProduct.set(productId, []);
          }
          batchStartsByProduct.get(productId)!.push(sh);
        }
      }

      // Update running stock
      runningStockByProduct.set(productId, currentStock + sh.change);
    }

    if (batchStartsByProduct.size === 0) return [];

    const batches: any[] = [];
    const today = new Date();

    for (const [
      productId,
      batchStartEntries,
    ] of batchStartsByProduct.entries()) {
      const stockHistory = stockHistoryByProduct.get(productId) || [];

      // Create a Set of batch start IDs for fast lookup
      const batchStartIds = new Set(
        batchStartEntries.map((batch) => batch._id.toString()),
      );

      const stockMovements = stockHistory
        .filter((sh) => {
          // Exclude entries that are batch starts
          return !batchStartIds.has(sh._id.toString());
        })
        .map((sh) => ({
          date: new Date(sh.createdAt),
          change: sh.change,
          isIncrease: sh.change > 0,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      let movementIndex = 0;
      let carriedOverReduction = 0;
      let carriedOverReductionDate: Date | null = null;

      for (let i = 0; i < batchStartEntries.length; i++) {
        const batchStart = batchStartEntries[i];

        const purchasedQty = Math.abs(batchStart.change);
        const purchaseDate = new Date(batchStart.createdAt);
        let batchRemaining = purchasedQty;
        let batchEndDate: Date | null = null;

        if (carriedOverReduction > 0 && carriedOverReductionDate) {
          const consumedFromCarryOver = Math.min(
            batchRemaining,
            carriedOverReduction,
          );
          batchRemaining -= consumedFromCarryOver;
          carriedOverReduction -= consumedFromCarryOver;

          batchEndDate = new Date(carriedOverReductionDate);

          if (carriedOverReduction === 0) {
            carriedOverReductionDate = null;
            movementIndex++;
          }
        }

        while (
          movementIndex < stockMovements.length &&
          stockMovements[movementIndex].date < purchaseDate
        ) {
          movementIndex++;
        }

        while (movementIndex < stockMovements.length && batchRemaining > 0) {
          const movement = stockMovements[movementIndex];

          if (movement.isIncrease) {
            batchRemaining += movement.change;
            batchEndDate = new Date(movement.date);
            movementIndex++;
          } else {
            const reductionQty = Math.abs(movement.change);

            if (reductionQty <= batchRemaining) {
              batchRemaining -= reductionQty;
              batchEndDate = new Date(movement.date);
              movementIndex++;
            } else {
              const consumed = batchRemaining;
              batchRemaining = 0;
              batchEndDate = new Date(movement.date);
              carriedOverReduction = reductionQty - consumed;
              carriedOverReductionDate = new Date(movement.date);
            }
          }
        }

        const displayEndDate =
          batchRemaining === 0 && batchEndDate ? batchEndDate : today;

        const durationMs = displayEndDate.getTime() - purchaseDate.getTime();
        const durationDays = Math.max(
          1,
          Math.ceil(durationMs / (1000 * 60 * 60 * 24)),
        );

        const consumed = purchasedQty - batchRemaining;
        const avgSalesPerDay = consumed > 0 ? consumed / durationDays : 0;

        batches.push({
          productId,
          purchasedQuantity: purchasedQty,
          startDate: format(purchaseDate, 'yyyy-MM-dd'),
          endDate: format(displayEndDate, 'yyyy-MM-dd'),
          duration: durationDays,
          averageSalesPerDay: parseFloat(avgSalesPerDay.toFixed(2)),
          remainingQuantity: batchRemaining,
          purchaseDate: format(purchaseDate, 'yyyy-MM-dd'),
          stockHistoryId: batchStart._id,
        });
      }
    }

    return batches;
  }

  async createCountList(createCountListDto: CreateCountListDto) {
    const countList = new this.countListModel(createCountListDto);
    countList._id = usernamify(countList.name);
    countList.locations = [1, 2];
    countList.active = true;
    countList.permissionRoles = [1];
    await countList.save();
    this.websocketGateway.emitCountListChanged();
    return countList;
  }
  async findAllCountLists(user: User) {
    // Manager can see all count lists
    if (user?.role?._id === RoleEnum.MANAGER) {
      return this.countListModel.find();
    }
    // Other roles can only see count lists they have permission for
    const userRoleId = user?.role?._id;
    if (!userRoleId) {
      return [];
    }
    return this.countListModel.find({
      permissionRoles: { $in: [userRoleId] },
    });
  }

  async updateCountList(id: string, updates: UpdateQuery<CountList>) {
    const countList = await this.countListModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitCountListChanged();
    return countList;
  }

  async removeCountList(id: string) {
    const counts = await this.countModel.find({ countList: id });
    if (counts.length > 0) {
      throw new HttpException(
        'Cannot remove a count list',
        HttpStatus.BAD_REQUEST,
      );
    }
    const countList = await this.countListModel.findByIdAndRemove(id);
    this.websocketGateway.emitCountListChanged();
    return countList;
  }
  // count
  async findAllCounts(user: User) {
    // Manager can see all counts
    if (user?.role?._id === RoleEnum.MANAGER) {
      return this.countModel.find().sort({ isCompleted: 1, completedAt: -1 });
    }
    // Other roles can only see counts from count lists they have permission for
    const userRoleId = user?.role?._id;
    if (!userRoleId) {
      return [];
    }
    const accessibleCountLists = await this.countListModel
      .find({ permissionRoles: { $in: [userRoleId] } })
      .select('_id')
      .lean();
    const countListIds = accessibleCountLists.map((cl) => cl._id);
    if (countListIds.length === 0) {
      return [];
    }
    return this.countModel
      .find({ countList: { $in: countListIds } })
      .sort({ isCompleted: 1, completedAt: -1 });
  }
  findCountById(id: string) {
    return this.countModel.findById(id);
  }
  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  async findQueryCounts(user, query: CountQueryDto) {
    const {
      page = 1,
      limit = 10,
      createdBy,
      countList,
      location,
      date,
      after,
      before,
      sort,
      asc,
      search, // <-- NEW
    } = query;

    const filter: FilterQuery<Count> = {};
    if (createdBy) filter.user = createdBy;
    if (countList) filter.countList = countList;

    // Role-based filtering: non-managers can only see counts from accessible count lists
    if (user?.role?._id !== RoleEnum.MANAGER) {
      const userRoleId = user?.role?._id;
      if (!userRoleId) {
        return {
          data: [],
          totalNumber: 0,
          totalPages: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 10,
        };
      }
      const accessibleCountLists = await this.countListModel
        .find({ permissionRoles: { $in: [userRoleId] } })
        .select('_id')
        .lean();
      const countListIds = accessibleCountLists.map((cl) => cl._id);
      if (countListIds.length === 0) {
        return {
          data: [],
          totalNumber: 0,
          totalPages: 0,
          page: Number(page) || 1,
          limit: Number(limit) || 10,
        };
      }
      // If countList filter already specified, ensure it's in accessible list
      if (filter.countList) {
        if (!countListIds.includes(filter.countList as string)) {
          return {
            data: [],
            totalNumber: 0,
            totalPages: 0,
            page: Number(page) || 1,
            limit: Number(limit) || 10,
          };
        }
      } else {
        // Otherwise, restrict to accessible count lists
        filter.countList = { $in: countListIds } as any;
      }
    }

    if (location !== undefined && location !== null && `${location}` !== '') {
      const locNum =
        typeof location === 'string' ? Number(location) : (location as number);
      if (!Number.isNaN(locNum)) filter.location = locNum;
    }
    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        filter.createdAt = rangeFilter;
      }
    }
    if (search && `${search}`.trim() !== '') {
      const raw = `${search}`.trim();
      const [
        searchedUserIds,
        searchedCountListIds,
        searchedProductIds,
        searchedLocationIds,
      ] = await Promise.all([
        this.userService.searchUserIds(raw).catch(() => []),
        this.countListModel
          .find({ name: { $regex: new RegExp(raw, 'i') } })
          .select('_id')
          .lean()
          .then((docs) => docs.map((d) => String(d._id)))
          .catch(() => []),
        this.productModel
          .find({
            $or: [
              { name: { $regex: new RegExp(raw, 'i') } },
              { sku: { $regex: new RegExp(raw, 'i') } },
              { code: { $regex: new RegExp(raw, 'i') } },
            ],
          })
          .select('_id')
          .lean()
          .then((docs) => docs.map((d) => String(d._id)))
          .catch(() => []),
        this.locationService?.searchLocationIds
          ? this.locationService
              .searchLocationIds(raw)
              .then((ids: number[]) => ids)
              .catch(() => [])
          : [],
      ]);

      const numericSearch = Number(raw);
      const isNumeric = !Number.isNaN(numericSearch);
      const directIdMatch = raw.length > 0 ? [{ _id: raw }] : [];
      const orList: FilterQuery<Count>[] = [];

      if (searchedUserIds.length)
        orList.push({ user: { $in: searchedUserIds } });
      if (searchedCountListIds.length)
        orList.push({ countList: { $in: searchedCountListIds } });
      if (searchedProductIds.length) {
        orList.push({
          products: { $elemMatch: { product: { $in: searchedProductIds } } },
        });
      }
      if (searchedLocationIds.length)
        orList.push({ location: { $in: searchedLocationIds } });
      if (isNumeric) orList.push({ location: numericSearch });
      if (directIdMatch.length) orList.push(...directIdMatch);

      if (!orList.length) {
        orList.push(
          { user: { $regex: new RegExp(raw, 'i') } },
          { countList: { $regex: new RegExp(raw, 'i') } },
          { _id: raw },
        );
      }
      if (orList.length) {
        const existing = Object.keys(filter).length ? [filter] : [];
        (filter as any).$and = [...existing, { $or: orList }];
        for (const k of Object.keys(filter)) {
          if (k !== '$and') delete (filter as any)[k];
        }
      }
    }

    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, totalNumber] = await Promise.all([
      this.countModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.countModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalNumber / limitNum);
    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  async createCount(createCountDto: CreateCountDto) {
    const counts = await this.countModel.find({
      isCompleted: false,
      user: createCountDto.user,
      location: createCountDto.location,
      countList: createCountDto.countList,
    });
    if (counts.length > 0) {
      throw new HttpException(
        'Count already exists and not finished',
        HttpStatus.BAD_REQUEST,
      );
    }
    const count = new this.countModel(createCountDto);
    count._id = usernamify(count.user + new Date().toISOString());
    this.websocketGateway.emitCountChanged();
    return count.save();
  }

  async updateCount(user: User, id: string, updates: UpdateQuery<Count>) {
    const count = await this.countModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (updates.isCompleted) {
      const notificationEvents =
        await this.notificationService.findAllEventNotifications();
      const notificationEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.COMPLETECOUNT,
      );
      if (notificationEvent) {
        const locations = await this.locationService.findAllLocations();
        const countList = await this.countListModel.findById(count.countList);
        const countLocation = locations.find(
          (location) => location._id === count.location,
        );
        const message = {
          key: 'CountListCompleted',
          params: {
            user: user?.name,
            location: countLocation?.name,
            list: countList?.name,
            navigate: `/archive/${count._id}`,
          },
        };

        const notificationDto: CreateNotificationDto = {
          type: notificationEvent.type,
          createdBy: notificationEvent.createdBy,
          selectedUsers: notificationEvent.selectedUsers,
          selectedRoles: notificationEvent.selectedRoles,
          selectedLocations: notificationEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.COMPLETECOUNT,
          message,
        };

        await this.notificationService.createNotification(
          notificationDto,
          user,
        );
      }
    }
    this.websocketGateway.emitCountChanged();
    return count;
  }

  async removeCount(id: string) {
    const count = await this.countModel.findByIdAndRemove(id);
    this.websocketGateway.emitCountChanged();
    return count;
  }

  async syncProductCountLists() {
    const allCountLists = await this.countListModel.find();

    // Build a map: productId -> countListId[]
    const productCountListMap = new Map<string, string[]>();
    for (const cl of allCountLists) {
      for (const entry of cl.products ?? []) {
        const pid = entry.product;
        if (!productCountListMap.has(pid)) {
          productCountListMap.set(pid, []);
        }
        productCountListMap.get(pid).push(cl._id);
      }
    }

    const updatePromises = [];
    for (const [productId, countListIds] of productCountListMap.entries()) {
      updatePromises.push(
        this.productModel.findByIdAndUpdate(productId, {
          countList: countListIds,
        }),
      );
    }

    await Promise.all(updatePromises);
    await this.websocketGateway.emitProductChanged();
    return { updated: productCountListMap.size };
  }

  async matchProducts() {
    const products = await this.productModel.find();
    const allMenuItems = await this.menuService.findAllUndeletedItems();
    for (const product of products) {
      const menuItem = allMenuItems.find(
        (item) => item.name.toLowerCase() === product.name.toLowerCase(),
      );
      if (!menuItem) {
        continue;
      }
      await this.updateProduct(null, product._id, {
        ...product,
        matchedMenuItem: menuItem._id,
      });
    }
  }
  async updateProductBaseQuantitytoMinQuantity() {
    const products = await this.productModel.find();
    for (const product of products) {
      if (product.baseQuantities?.length > 0) {
        let newBaseQuantities = [];
        for (const baseQuantity of product.baseQuantities) {
          newBaseQuantities.push({
            ...baseQuantity,
            minQuantity: (baseQuantity as any)?.quantity ?? 0,
          });
        }
        await this.productModel.findByIdAndUpdate(product._id, {
          baseQuantities: newBaseQuantities,
        });
      }
    }
    await this.websocketGateway.emitProductChanged();
  }
  async updateMultipleBaseQuantities(
    updates: { _id: string; baseQuantities: any[] }[],
  ) {
    const updatePromises = updates.map(async (update) => {
      const updatedProduct = await this.productModel.findByIdAndUpdate(
        update._id,
        { baseQuantities: update.baseQuantities },
        { new: true },
      );
      if (updatedProduct) {
        return updatedProduct;
      }
      return null;
    });

    // Wait for all update operations to finish concurrently
    const updatedProducts = await Promise.all(updatePromises);
    await this.websocketGateway.emitProductChanged();
    // Remove any null results (if a product wasn't updated)
    return updatedProducts.filter((product) => product);
  }

  async updateMultipleProduct(
    updateMultipleProductDto: UpdateMultipleProduct[],
  ) {
    let errorDatas = [];
    for (const updateDto of updateMultipleProductDto) {
      try {
        const {
          name,
          expenseType,
          brand,
          vendor,
          countList,
          locations: locationsInput,
        } = updateDto;
        //  if name field is not provided it will not be created
        if (!name) {
          errorDatas.push({
            ...updateDto,
            errorNote: 'Name field not provided',
          });
          continue;
        }
        // spliting the multiple entries
        const expenseTypeArray = expenseType?.trim()
          ? expenseType
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        const vendorArray = vendor?.trim()
          ? vendor
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        const brandArray = brand?.trim()
          ? brand
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        let newExpenseTypes = [];
        let newVendor = [];
        let newBrand = [];
        // find the ids of the expenseType, vendor and brand
        for (const expTypeName of expenseTypeArray) {
          const foundExpenseType = await this.expenseTypeModel.find({
            name: expTypeName,
          });
          if (foundExpenseType.length > 0) {
            newExpenseTypes.push(foundExpenseType[0]._id);
          }
        }
        for (const vendorName of vendorArray) {
          const foundVendor = await this.vendorModel.find({
            name: vendorName,
          });
          if (foundVendor.length > 0) {
            newVendor.push(foundVendor[0]._id);
          }
        }
        for (const brandName of brandArray) {
          const foundBrand = await this.brandModel.find({
            name: brandName,
          });
          if (foundBrand.length > 0) {
            newBrand.push(foundBrand[0]._id);
          }
        }
        if (expenseTypeArray?.length > newExpenseTypes?.length) {
          errorDatas.push({
            ...updateDto,
            errorNote: 'Expense types are not written correctly',
          });
          continue;
        }
        if (vendorArray?.length > newVendor?.length) {
          errorDatas.push({
            ...updateDto,
            errorNote: 'Vendors are not written correctly',
          });
          continue;
        }
        if (brandArray?.length > newBrand?.length) {
          errorDatas.push({
            ...updateDto,
            errorNote: 'Brands are not written correctly',
          });
          continue;
        }

        // resolve countList and location IDs before updating
        let countListIds = [];
        let locationIds = [];
        if (countList !== undefined && countList !== null) {
          const countListNames = countList?.trim()
            ? countList
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          const locationNames = locationsInput?.trim()
            ? locationsInput
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          if (countListNames.length > 0) {
            const foundCountLists = await this.countListModel
              .find({ name: { $in: countListNames } })
              .select('_id')
              .lean();
            countListIds = foundCountLists.map((cl) => cl._id);
          }
          if (locationNames.length > 0) {
            const foundLocations = await this.locationService.findManyByNames(
              locationNames,
            );
            locationIds = foundLocations.map((loc) => loc._id);
          }
        }

        const updatedProduct = await this.productModel.findOneAndUpdate(
          { name: name, deleted: false },
          {
            ...(newExpenseTypes.length > 0 && { expenseType: newExpenseTypes }),
            ...(newVendor.length > 0 && { vendor: newVendor }),
            ...(newBrand.length > 0 && { brand: newBrand }),
            ...(countList !== undefined &&
              countList !== null && { countList: countListIds }),
          },
          { new: true },
        );

        if (updatedProduct && countList !== undefined && countList !== null) {
          await this.countListModel.updateMany(
            {},
            { $pull: { products: { product: updatedProduct._id } } },
          );

          if (countListIds.length > 0) {
            await this.countListModel.updateMany(
              { _id: { $in: countListIds } },
              {
                $push: {
                  products: {
                    product: updatedProduct._id,
                    locations: locationIds,
                  },
                },
              },
            );
          }

          this.websocketGateway.emitCountListChanged();
        }
      } catch (e) {
        this.logger.error('Error updating product:', e);
        errorDatas.push({ ...updateDto, errorNote: 'Error occured' });
      }
    }
    this.websocketGateway.emitProductChanged();
    return errorDatas;
  }
  async addMultipleProductAndMenuItem(
    addMultipleProductAndMenuItemDto: AddMultipleProductAndMenuItemDto[],
  ) {
    let errorDatas = [];
    for (const addDto of addMultipleProductAndMenuItemDto) {
      try {
        const {
          name,
          expenseType,
          brand,
          vendor,
          category,
          itemProduction,
          price,
          onlinePrice,
          sku,
          barcode,
          description,
          image,
          countList,
          locations: locationsInput,
        } = addDto;

        //  if name field is not provided it will not be created
        if (!name) {
          errorDatas.push({ ...addDto, errorNote: 'Name field not provided' });
          continue;
        }
        let isProductCreated = false;
        let isMenuItemCreated = false;
        let newProduct;
        let newMenuItem;
        let imageArray = [];
        if (image) {
          try {
            const imageNameArray = image?.trim()
              ? image
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
              : [];
            for (const imageName of imageNameArray) {
              const foundImage = await this.assetService.getImageWithPublicID(
                imageName,
              );
              if (foundImage) {
                imageArray.push(foundImage);
              }
            }
          } catch (e) {
            this.logger.error('Error adding product:', e);
            errorDatas.push({
              ...addDto,
              errorNote:
                'image is not uploaded or the file name is written wrong.',
            });
            continue;
          }
        }

        // spliting the multiple entries
        const expenseTypeArray = expenseType?.trim()
          ? expenseType
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        const vendorArray = vendor?.trim()
          ? vendor
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        const brandArray = brand?.trim()
          ? brand
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        const ItemProductionArray = itemProduction?.trim()
          ? itemProduction
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [];

        //  if expenseType is provided it will create a product
        if (expenseTypeArray?.length > 0) {
          let newExpenseTypes = [];
          let newVendor = [];
          let newBrand = [];

          // find the ids of the expenseType, vendor and brand
          for (const expTypeName of expenseTypeArray) {
            const foundExpenseType = await this.expenseTypeModel.find({
              name: expTypeName,
            });
            if (foundExpenseType.length > 0) {
              newExpenseTypes.push(foundExpenseType[0]._id);
            }
          }

          for (const vendorName of vendorArray) {
            const foundVendor = await this.vendorModel.find({
              name: vendorName,
            });
            if (foundVendor.length > 0) {
              newVendor.push(foundVendor[0]._id);
            }
          }
          for (const brandName of brandArray) {
            const foundBrand = await this.brandModel.find({
              name: brandName,
            });
            if (foundBrand.length > 0) {
              newBrand.push(foundBrand[0]._id);
            }
            if (expenseTypeArray?.length > newExpenseTypes?.length) {
              errorDatas.push({
                ...addDto,
                errorNote: 'Expense types are not written correctly',
              });
              continue;
            }
            if (vendorArray?.length > newVendor?.length) {
              errorDatas.push({
                ...addDto,
                errorNote: 'Vendors are not written correctly',
              });
              continue;
            }
            if (brandArray?.length > newBrand?.length) {
              errorDatas.push({
                ...addDto,
                errorNote: 'Brands are not written correctly',
              });
              continue;
            }
          }

          // if expenseType is not found it will not be created
          if (newExpenseTypes.length === 0) {
            errorDatas.push({
              ...addDto,
              errorNote: 'Expense types are not written correctly',
            });
            continue;
          }
          const product = await this.productModel.find({
            name: name,
            deleted: false,
          });
          // if product already exists it will not be created
          if (product.length > 0) {
            errorDatas.push({
              ...addDto,
              errorNote: 'Product already created',
            });

            continue;
          }
          newProduct = new this.productModel({
            name,
            expenseType: newExpenseTypes,
            brand: newBrand,
            vendor: newVendor,
            deleted: false,
          });
          const locations = await this.locationService.findStockLocations();
          newProduct.baseQuantities = locations.map((location) => {
            return {
              location: location._id,
              minQuantity: 0,
            };
          });
          newProduct._id = usernamify(name);

          // resolve countList and location IDs before saving
          let countListIds = [];
          let locationIds = [];
          if (countList?.trim()) {
            const countListNames = countList
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const locationNames = locationsInput?.trim()
              ? locationsInput
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];

            if (countListNames.length > 0) {
              const foundCountLists = await this.countListModel
                .find({ name: { $in: countListNames } })
                .select('_id')
                .lean();
              countListIds = foundCountLists.map((cl) => cl._id);
            }
            if (locationNames.length > 0) {
              const foundLocations = await this.locationService.findManyByNames(
                locationNames,
              );
              locationIds = foundLocations.map((loc) => loc._id);
            }

            if (countListIds.length > 0) {
              newProduct.countList = countListIds;
            }
          }

          await newProduct.save();
          isProductCreated = true;

          if (countListIds.length > 0) {
            await this.countListModel.updateMany(
              { _id: { $in: countListIds } },
              {
                $addToSet: {
                  products: {
                    product: newProduct._id,
                    locations: locationIds,
                  },
                },
              },
            );
            this.websocketGateway.emitCountListChanged();
          }
        }
        //if category and price provided then the menuItem will be created
        if (category && price) {
          const foundCategory = await this.menuService.findCategoryByName(
            category,
          );
          // if category is not found it will not be created
          if (!foundCategory) {
            if (isProductCreated && newProduct) {
              await this.productModel.findByIdAndRemove(newProduct._id);
            }
            errorDatas.push({
              ...addDto,
              errorNote: 'Category is not written correctly',
            });

            continue;
          }
          const menuItem = await this.menuService.findItemByName(name);
          // if menuItem already exists it will not be created
          if (menuItem) {
            errorDatas.push({
              ...addDto,
              errorNote: 'Menu Item already created',
            });
            continue;
          }
          const parseItemAndQty = (
            input: unknown,
          ): { name: string; qty: number } => {
            const s = String(input ?? '').trim();
            const m = s.match(/^(.*?)(?:_(\d+))?$/);
            if (!m) return { name: s, qty: 1 };
            const base = m[1].trim();
            const qty = m[2] ? Math.max(1, parseInt(m[2], 10)) : 1;
            return { name: base, qty };
          };

          const newItemProduction: Array<{
            product: any;
            quantity: number;
            isDecrementStock: boolean;
          }> = [];

          for (const itemProductionName of ItemProductionArray) {
            const { name, qty } = parseItemAndQty(itemProductionName);
            const foundItemProduction = await this.productModel.findOne({
              name,
              deleted: false,
            });
            if (foundItemProduction) {
              newItemProduction.push({
                product: foundItemProduction._id,
                quantity: qty,
                isDecrementStock: true,
              });
            }
          }

          newMenuItem = await this.menuService.createBulkMenuItemWithProduct({
            name: name,
            category: foundCategory._id,
            price: price,
            itemProduction: newItemProduction,
            ...(onlinePrice ? { onlinePrice } : {}),
            ...(description ? { description } : {}),
            ...(sku ? { sku } : {}),
            ...(barcode ? { barcode } : {}),
            ...(imageArray?.length > 0 ? { imageUrl: imageArray[0] } : {}),
            ...(imageArray?.length > 1
              ? { productImages: imageArray.slice(1) }
              : {}),
          });
          isMenuItemCreated = true;
        }
        // if product and menuItem is created then the product will be matched with the menuItem
        if (
          isProductCreated &&
          isMenuItemCreated &&
          newProduct &&
          newMenuItem
        ) {
          try {
            await this.productModel.findByIdAndUpdate(
              newProduct._id,
              {
                matchedMenuItem: newMenuItem._id,
              },
              { new: true },
            );
            await this.menuService.updateForBulkItem(
              newMenuItem._id,
              newProduct._id,
            );
          } catch (e) {
            await this.productModel.findByIdAndRemove(newProduct._id);
            await this.menuService.deleteMenuItem(newMenuItem._id);
            errorDatas.push({
              ...addDto,
              errorNote: 'Error occured',
            });
          }
        }
      } catch (e) {
        this.logger.error('Error adding product:', e);
        errorDatas.push({ ...addDto, errorNote: 'Error occured' });
      }
    }

    this.websocketGateway.emitBulkProductAndMenuItemChanged();
    return errorDatas;
  }
  async createStockForAllLocations(user: User) {
    try {
      const products = await this.productModel.find({ deleted: false });
      const locations = await this.locationService.findStockLocations();
      const stocks = await this.stockModel.find();

      const createStockTasks = [];
      for (const product of products) {
        for (const location of locations) {
          const stockExists = stocks.find(
            (stock) =>
              (stock.product as any) === product._id &&
              Number(stock.location) === location._id,
          );

          if (!stockExists) {
            const newStock = new this.stockModel({
              product: product._id,
              location: location._id,
              quantity: 0,
            });
            const stockId = usernamify(product._id + String(location._id));
            newStock._id = stockId;
            createStockTasks.push(newStock.save());
          }
        }
      }
      await Promise.all(createStockTasks);
      this.websocketGateway.emitStockChanged();
      this.logger.log('All missing stocks created.');
    } catch (error) {
      this.logger.error('Failed to create stocks:', error);
    }
  }

  async shouldCloseItemOnStockOut(
    productId: string,
    locationId: number,
    stocks?: Stock[],
  ): Promise<boolean> {
    const currentLocation = await this.locationService.findLocationById(
      locationId,
    );
    if (!currentLocation?.fallbackStockLocation) {
      return true;
    }
    let fallbackStock: Stock | undefined;
    if (stocks) {
      fallbackStock = stocks.find(
        (s) => s.location === currentLocation.fallbackStockLocation,
      );
    } else {
      const fallbackStockId = usernamify(
        productId + currentLocation.fallbackStockLocation,
      );
      fallbackStock = await this.stockModel.findById(fallbackStockId);
    }
    return !(fallbackStock && fallbackStock.quantity > 0);
  }

  async removeUnwantedBaseLocations(): Promise<void> {
    const stockLocations = await this.locationService.findStockLocations();
    const stocks = await this.stockModel.find();
    const validLocationIds = new Set(
      stockLocations.map((loc) => loc._id.toString()),
    );
    const products = await this.productModel.find();
    await Promise.all(
      products.map((product) => {
        if (!product.baseQuantities?.length) return Promise.resolve();
        const filteredBaseQuantities = product.baseQuantities.filter(
          ({ location }) => validLocationIds.has(location.toString()),
        );
        return this.productModel.findByIdAndUpdate(product._id, {
          baseQuantities: filteredBaseQuantities,
        });
      }),
    );
    await Promise.all(
      stocks.map(async (stock) => {
        if (!validLocationIds.has(stock.location.toString())) {
          await this.stockModel.findByIdAndRemove(stock._id);
        }
      }),
    );
    await this.websocketGateway.emitProductChanged();
    await this.websocketGateway.emitStockChanged();
  }

  private buildExpenseTypeMatchCondition(
    expenseType: string | undefined,
    forbiddenExpenseTypeIds: string[],
  ): Record<string, unknown> {
    if (expenseType && forbiddenExpenseTypeIds.length > 0) {
      return forbiddenExpenseTypeIds.includes(expenseType)
        ? { expenseType: { $in: [] } }
        : { expenseType };
    }
    if (expenseType) return { expenseType };
    if (forbiddenExpenseTypeIds.length > 0)
      return { expenseType: { $nin: forbiddenExpenseTypeIds } };
    return {};
  }

  private extractUserRoleId(user?: User): number | null {
    const role = user?.role;
    if (!user || !role) return null;
    return typeof role === 'object' && role !== null
      ? (role as { _id?: RoleId })._id ?? null
      : (role as unknown as RoleId);
  }

  private async getForbiddenExpenseTypeIds(
    user: User | undefined,
    page: string,
  ): Promise<ExpenseTypeId[]> {
    const userRoleId = this.extractUserRoleId(user);
    const restrictedExpenseTypes = await this.expenseTypeModel.find({
      isRoleRestricted: true,
    });
    return restrictedExpenseTypes
      .filter((et) => {
        const pagePerm = (et.pagePermissions ?? []).find(
          (p) => p.page === page,
        );
        if (!pagePerm) return false;
        return (
          userRoleId === null || !pagePerm.allowedRoles.includes(userRoleId)
        );
      })
      .map((et) => et._id);
  }
}
