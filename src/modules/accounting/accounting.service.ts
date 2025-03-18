import { forwardRef, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { ActivityType } from '../activity/activity.dto';
import { CheckoutService } from '../checkout/checkout.service';
import { IkasService } from '../ikas/ikas.service';
import { LocationService } from '../location/location.service';
import {
  CreateNotificationDto,
  NotificationEventType,
} from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { dateRanges } from './../../utils/dateRanges';
import { ActivityService } from './../activity/activity.service';
import { AssetService } from './../asset/asset.service';
import { MenuService } from './../menu/menu.service';
import {
  AddMultipleProductAndMenuItemDto,
  ConsumptStockDto,
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
  JoinProductDto,
  StockHistoryFilter,
  StockHistoryStatusEnum,
  StockQueryDto,
  UpdateMultipleProduct,
} from './accounting.dto';
import { AccountingGateway } from './accounting.gateway';
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

export class AccountingService {
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
    private readonly accountingGateway: AccountingGateway,
    @Inject(forwardRef(() => LocationService))
    private readonly locationService: LocationService,
    @Inject(forwardRef(() => IkasService))
    private readonly ikasService: IkasService,
    private readonly redisService: RedisService,
    private readonly assetService: AssetService,
    private readonly notificationService: NotificationService,
  ) {}
  //   Products
  findActiveProducts() {
    return this.productModel.find({ deleted: { $ne: true } });
  }
  async findDeletedProducts() {
    return this.productModel.find({ deleted: true });
  }

  async findAllProducts() {
    try {
      const redisProducts = await this.redisService.get(
        RedisKeys.AccountingProducts,
      );
      if (redisProducts) {
        return redisProducts;
      }
    } catch (error) {
      console.error('Failed to retrieve products from Redis:', error);
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
      console.error('Failed to retrieve products from database:', error);
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
      const locations = await this.locationService.findAllLocations();

      const product = new this.productModel(createProductDto);
      product._id = usernamify(product.name);
      product.baseQuantities = locations.map((location) => {
        return {
          location: location._id,
          minQuantity: 0,
          maxQuantity: 0,
        };
      });
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
      await this.accountingGateway.emitProductChanged(user, product);
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
    this.accountingGateway.emitCountListChanged(user, countLists);

    // updateStocks
    await this.stockModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    this.accountingGateway.emitStockChanged(user, stayedProduct);
    // update invoices
    await this.expenseModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    this.accountingGateway.emitInvoiceChanged(user, stayedProduct);
    //update menu items
    await this.menuService.updateMenuItemProduct(
      user,
      stayedProduct,
      removedProduct,
    );

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
    await this.accountingGateway.emitProductChanged(user, product);
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
    if (product?.matchedMenuItem && !updates?.matchedMenuItem) {
      await this.menuService.updateProductItem(user, product.matchedMenuItem, {
        matchedProduct: null,
      });
    }
    const updatedProduct = await this.productModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    await this.accountingGateway.emitProductChanged(user, updatedProduct);

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
    await this.accountingGateway.emitProductChanged(user, updatedProduct);
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
    await this.accountingGateway.emitProductChanged(user, product);
    return product;
  }

  async checkIsProductRemovable(id: string) {
    const invoices = await this.expenseModel.find({ product: id });
    const menuItems = await this.menuService.findAllItems();
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
  findAllServices() {
    return this.serviceModel.find();
  }

  async createService(user: User, createServiceDto: CreateServiceDto) {
    const service = new this.serviceModel(createServiceDto);
    service._id = usernamify(service.name);
    await service.save();
    this.accountingGateway.emitServiceChanged(user, service);
    return service;
  }

  async updateService(user: User, id: string, updates: UpdateQuery<Service>) {
    const service = await this.serviceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.accountingGateway.emitServiceChanged(user, service);
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
    this.accountingGateway.emitServiceChanged(user, service);
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
    this.accountingGateway.emitExpenseTypeChanged(user, expenseType);
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
    this.accountingGateway.emitExpenseTypeChanged(user, newExpenseType);
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
    this.accountingGateway.emitExpenseTypeChanged(user, expenseType);
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
    this.accountingGateway.emitBrandChanged(user, brand);
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
        console.error('Error creating brand:', error);
        return { success: false, brand: null, error: error };
      }
    });
    const brands = await Promise.all(brandCreationResults);
    const successfulBrands = brands
      .filter((result) => result.success)
      .map((result) => result.brand);
    if (successfulBrands.length > 0) {
      this.accountingGateway.emitBrandChanged(user, successfulBrands);
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
    this.accountingGateway.emitBrandChanged(user, newBrand);
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
    this.accountingGateway.emitBrandChanged(user, brand);
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
    this.accountingGateway.emitVendorChanged(user, vendor);
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
    this.accountingGateway.emitVendorChanged(user, newVendor);
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
    this.accountingGateway.emitVendorChanged(user, vendor);
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
    this.accountingGateway.emitProductCategoryChanged(user, productCategory);
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

    this.accountingGateway.emitProductCategoryChanged(user, newProductCategory);
    return newProductCategory;
  }

  async removeProductCategory(user: User, id: string) {
    // TODO : check will be added here before removing
    const productCategory = await this.productCategoryModel.findByIdAndRemove(
      id,
    );
    this.accountingGateway.emitProductCategoryChanged(user, productCategory);
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
    this.accountingGateway.emitPaymentMethodChanged(user, paymentMethod);
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
    this.accountingGateway.emitPaymentMethodChanged(user, newPaymentMethod);
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
    this.accountingGateway.emitPaymentMethodChanged(user, paymentMethod);
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
  findAllPayments() {
    return this.paymentModel.find().sort({ _id: -1 });
  }

  async createPayment(user: User, createPaymentDto: CreatePaymentDto) {
    const payment = await this.paymentModel.create({
      ...createPaymentDto,
      user: user,
    });
    this.accountingGateway.emitPaymentChanged(user, payment);
    return payment;
  }

  async updatePayment(user: User, id: string, updates: UpdateQuery<Payment>) {
    const newPayment = this.paymentModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.accountingGateway.emitPaymentChanged(user, newPayment);
    return newPayment;
  }

  async removePayment(user: User, id: string) {
    const payment = await this.paymentModel.findByIdAndRemove(id);
    this.accountingGateway.emitPaymentChanged(user, payment);
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
    } = filter;
    const skip = (pageNum - 1) * limitNum;
    const productArray = product ? product.split(',') : [];
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
    if (search) {
      searchedPaymentMethodsIds = await this.paymentMethodModel
        .find({ name: { $regex: new RegExp(search, 'i') } })
        .select('_id')
        .then((docs) => docs.map((doc) => doc._id));
      searchedLocationIds = await this.locationService.searchLocationIds(
        search,
      );
      if (Number(search)) {
        searchedExpenses = await this.expenseModel
          .find({
            _id: Number(search),
          })
          .select('_id')
          .then((docs) => docs.map((doc) => doc._id));
      }
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(product && { product: { $in: productArray } }),
          ...(service && { service: { $in: serviceArray } }),
          ...(expenseType && { expenseType: expenseType }),
          ...(paymentMethod && { paymentMethod: paymentMethod }),
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
                  { product: { $regex: regexSearch } },
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
      };
    }

    // Return the first element of results which contains all required properties
    return results[0];
  }
  async findAllExpenseWithoutPagination(
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
    if (date) {
      const dateRange = dateRanges[date];
      if (dateRange) {
        after = dateRange().after;
        before = dateRange().before;
      }
    }
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(location && { location: Number(location) }),
          ...(product && { product: { $in: productArray } }),
          ...(service && { service: { $in: serviceArray } }),
          ...(expenseType && { expenseType: expenseType }),
          ...(paymentMethod && { paymentMethod: paymentMethod }),
          ...(brand && { brand: brand }),
          ...(type && { type: type }),
          ...(vendor && { vendor: vendor }),
          ...(after && { date: { $gte: after } }),
          ...(before && { date: { $lte: before } }),
          ...(after && before && { date: { $gte: after, $lte: before } }),
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
    let errorDatas = [];
    for (const expenseDto of createExpenseDto) {
      try {
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
          kdv,
          isStockIncrement,
          note,
        } = expenseDto;
        const foundProduct = await this.productModel.findOne({
          name: product,
          deleted: false,
        });
        if (!foundProduct) {
          errorDatas.push({ ...expenseDto, errorNote: 'Product not found' });
          continue;
        }
        const foundExpenseType = await this.expenseTypeModel.findOne({
          name: expenseType,
        });
        if (!foundExpenseType) {
          errorDatas.push({
            ...expenseDto,
            errorNote: 'Expense type not found',
          });
          continue;
        }
        const foundLocation = await this.locationService.findByName(location);
        if (!foundLocation) {
          errorDatas.push({ ...expenseDto, errorNote: 'Location not found' });
          continue;
        }
        let foundBrand;
        if (brand) {
          foundBrand = await this.brandModel.findOne({ name: brand });
        }
        const foundVendor = await this.vendorModel.findOne({ name: vendor });
        if (!foundVendor) {
          errorDatas.push({ ...expenseDto, errorNote: 'Vendor not found' });
          continue;
        }
        const foundPaymentMethod = await this.paymentMethodModel.findOne({
          name: paymentMethod,
        });
        if (!foundPaymentMethod) {
          errorDatas.push({
            ...expenseDto,
            errorNote: 'Payment method not found',
          });
          continue;
        }
        if (!quantity || !kdv || !price) {
          errorDatas.push({
            ...expenseDto,
            errorNote: 'Quantity, price or kdv is missing',
          });
          continue;
        }
        if (!date) {
          errorDatas.push({
            ...expenseDto,
            errorNote: 'Date is missing',
          });
          continue;
        }
        const dateParts = date.split('-');
        const adjustedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        const totalExpense =
          Number(price) + Number(kdv) * (Number(price) / 100);
        const type = ExpenseTypes.STOCKABLE;
        await this.createExpense(
          user,
          {
            date: adjustedDate,
            product: foundProduct._id,
            expenseType: foundExpenseType._id,
            location: foundLocation._id,
            brand: foundBrand ? foundBrand._id : null,
            vendor: foundVendor._id,
            paymentMethod: foundPaymentMethod._id,
            quantity: Number(quantity),
            isPaid: true,
            totalExpense: Number(totalExpense),
            note: note,
            type: type,
            isStockIncrement: Boolean(isStockIncrement) ?? false,
          },
          StockHistoryStatusEnum.EXPENSEENTRY,
          true,
        );
      } catch (e) {
        console.log(e);
        errorDatas.push({ ...expenseDto, errorNote: 'Error occured' });
      }
    }
    this.accountingGateway.emitExpenseChanged(user);
    this.accountingGateway.emitProductChanged(user);
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
            await this.accountingGateway.emitProductChanged(user, product);
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
          this.accountingGateway.emitServiceChanged(user, service);
        }
      }

      const expense = await this.expenseModel.create({
        ...createExpenseDto,
        user: user._id,
      });
      if (!isMultipleCreate) {
        this.accountingGateway.emitExpenseChanged(user, expense);
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
        });
      }
      this.activityService.addActivity(
        user,
        ActivityType.CREATE_EXPENSE,
        expense,
      );
      return expense;
    } catch (error) {
      console.log(error);
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
      this.accountingGateway.emitExpenseChanged(user, newExpense);
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
      this.accountingGateway.emitExpenseChanged(user, newExpense);
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
          isStockIncrement: updates?.isStockIncrement
            ? updates?.isStockIncrement
            : expense?.isStockIncrement ?? false,
        },
        StockHistoryStatusEnum.EXPENSEUPDATEENTRY,
      );
    }
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
    this.accountingGateway.emitExpenseChanged(user, expense);
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
    this.accountingGateway.emitPaymentChanged(user, null);
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
      await this.accountingGateway.emitProductChanged(user, product);
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
      console.error('Failed to retrieve stocks from Redis:', error);
    }

    try {
      const stocks = await this.stockModel.find();
      if (stocks.length > 0) {
        await this.redisService.set(RedisKeys.AccountingStocks, stocks);
      }
      return stocks;
    } catch (error) {
      console.error('Failed to retrieve stocks from database:', error);
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

  async findQueryStocks(user: User, query: StockQueryDto) {
    const { after } = query;
    const filterQuery = {};
    if (after) {
      filterQuery['createdAt'] = { $gte: new Date(after) };
    }
    const stocks = await this.stockModel.find();
    if (!after) {
      return stocks;
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
      const products = await this.findActiveProducts();
      const stockLocation = location ? Number(location) : null;
      let afterFilterQuery = {};
      let beforeFilterQuery = {};
      afterFilterQuery['createdAt'] = { $gte: new Date(after) };

      beforeFilterQuery['createdAt'] = {
        $gte: new Date(new Date(before).getTime() + 24 * 60 * 60 * 1000),
      };

      if (stockLocation) {
        afterFilterQuery['location'] = stockLocation;
        beforeFilterQuery['location'] = stockLocation;
      }

      const findFilterStocksValue = async (filterQuery) => {
        const stocks = await this.stockModel.find({
          ...(stockLocation && { location: stockLocation }),
        });
        let filteredStocks = [];
        const stockHistory = await this.productStockHistoryModel.find({
          ...filterQuery,
        });
        for (const stock of stocks) {
          const productStockHistory = stockHistory?.filter(
            (stockHistory) =>
              stockHistory.product.toString() === stock.product.toString() &&
              stockHistory.location === stock.location,
          );
          let changeSum = productStockHistory?.reduce(
            (acc, history) => acc + history.change * -1,
            0,
          );
          if (productStockHistory?.length > 0) {
            stock.quantity += changeSum;
          }
          filteredStocks.push({
            _id: stock._id,
            product: stock.product,
            location: Number(stock.location),
            quantity: stock.quantity,
          });
        }
        filteredStocks;
        const totalValue = filteredStocks.reduce((acc, stock) => {
          const foundProduct = products.find(
            (product) => product._id === stock.product,
          );
          if (!foundProduct) {
            return acc;
          }
          const expense = (foundProduct?.unitPrice ?? 0) * stock.quantity;
          return acc + expense;
        }, 0);
        return totalValue;
      };

      // Using await to ensure that the asynchronous function completes before proceeding.
      const afterTotalValue = await findFilterStocksValue(afterFilterQuery);
      const beforeTotalValue = await findFilterStocksValue(beforeFilterQuery);

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
  async updateIkasStock(productId: string, location: number, quantity: number) {
    const menuItem = await this.menuService.findByMatchedProduct(productId);
    if (!menuItem || !menuItem.ikasId) {
      return;
    }
    const foundLocation = await this.locationService.findLocationById(location);
    if (!foundLocation.ikasId) {
      return;
    }
    await this.ikasService.updateProductStock(
      menuItem.ikasId,
      location,
      quantity,
    );
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
      this.accountingGateway.emitStockChanged(user, newStock);
      // create stock history with currentAmount
      await this.createProductStockHistory(user, {
        user: user._id,
        product: createStockDto.product,
        location: createStockDto.location,
        change: createStockDto.quantity,
        status,
        currentAmount: oldQuantity,
      });
      // create Activity
      await this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        existingStock,
        newStock,
      );
      this.updateIkasStock(
        createStockDto.product,
        createStockDto.location,
        oldQuantity + createStockDto.quantity,
      );
    } else {
      const stock = new this.stockModel(stockData);
      stock._id = stockId;
      await stock.save();
      this.accountingGateway.emitStockChanged(user, stock);
      // create Activity
      await this.activityService.addActivity(
        user,
        ActivityType.CREATE_STOCK,
        stock,
      );
      // create stock history with currentAmount 0
      await this.createProductStockHistory(user, {
        user: user._id,
        product: createStockDto.product,
        location: createStockDto.location,
        change: createStockDto.quantity,
        status,
        currentAmount: 0,
      });
      this.updateIkasStock(
        createStockDto.product,
        createStockDto.location,
        createStockDto.quantity,
      );
    }
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
    this.accountingGateway.emitCountChanged(user, count);
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
    this.accountingGateway.emitStockChanged(user, stock);
    return stock;
  }
  async removeStock(user: User, id: string, status: string) {
    const stock = await this.stockModel.findById(id).populate('product');

    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Create stock history with status delete
      await this.createProductStockHistory(user, {
        product: stock.product?._id,
        location: stock.location,
        currentAmount: stock.quantity,
        change: -1 * stock.quantity,
        status: status,
        user: user._id,
      });
      const deletedStock = await this.stockModel.findByIdAndRemove(id);
      this.updateIkasStock(stock.product?._id, stock.location, 0);
      this.activityService.addActivity(
        user,
        ActivityType.DELETE_STOCK,
        deletedStock,
      );
      // Remove the stock item
      this.accountingGateway.emitStockChanged(user, deletedStock);
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
    this.accountingGateway.emitProductStockHistoryChanged(
      user,
      ProductStockHistory,
    );
    for (const stock of productStocks) {
      await this.stockModel.findByIdAndRemove(stock.id);
    }
    this.accountingGateway.emitStockChanged(user, productStocks);
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
      await this.createProductStockHistory(user, {
        user: user._id,
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        change: -consumptStockDto.quantity,
        status: consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION,
        currentAmount:
          consumptStockDto.quantity > 0
            ? Number(newStock.quantity) + Number(consumptStockDto.quantity)
            : stock.quantity,
      });
      this.accountingGateway.emitStockChanged(user, newStock);
      await this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        stock,
        newStock,
      );
      this.updateIkasStock(
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
      location,
      status,
      before,
      after,
      sort,
      asc,
      vendor,
      brand,
    } = filter;
    const skip = (pageNum - 1) * limitNum;
    const productArray = product ? (product as any).split(',') : [];
    const sortObject = {};

    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['createdAt'] = -1;
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
        $match: {
          ...(location && { location: Number(location) }),
          ...(status && { status: status }),
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
          ...(before && { createdAt: { $lte: new Date(before) } }),
          ...(after && { createdAt: { $gte: new Date(after) } }),
          ...(after && before && { date: { $gte: after, $lte: before } }),
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

    // Return the first element of results which contains all required properties
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
    this.accountingGateway.emitProductStockHistoryChanged(
      user,
      productStockHistory,
    );
    return productStockHistory.save();
  }

  // countlist
  async createCountList(user: User, createCountListDto: CreateCountListDto) {
    const countList = new this.countListModel(createCountListDto);
    countList._id = usernamify(countList.name);
    countList.locations = [1, 2];
    countList.active = true;
    await countList.save();
    this.accountingGateway.emitCountListChanged(user, countList);
    return countList;
  }
  findAllCountLists() {
    return this.countListModel.find();
  }

  async updateCountList(
    user: User,
    id: string,
    updates: UpdateQuery<CountList>,
  ) {
    const countList = await this.countListModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.accountingGateway.emitCountListChanged(user, countList);
    return countList;
  }

  async removeCountList(user: User, id: string) {
    const counts = await this.countModel.find({ countList: id });
    if (counts.length > 0) {
      throw new HttpException(
        'Cannot remove a count list',
        HttpStatus.BAD_REQUEST,
      );
    }
    const countList = await this.countListModel.findByIdAndRemove(id);
    this.accountingGateway.emitCountListChanged(user, countList);
    return countList;
  }
  // count
  findAllCounts() {
    return this.countModel.find().sort({ isCompleted: 1, completedAt: -1 });
  }

  async createCount(user: User, createCountDto: CreateCountDto) {
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
    this.accountingGateway.emitCountChanged(user, count);
    return count.save();
  }

  async updateCount(user: User, id: string, updates: UpdateQuery<Count>) {
    const count = await this.countModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (count.isCompleted) {
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
        const notificationDto: CreateNotificationDto = {
          type: notificationEvent.type,
          createdBy: notificationEvent.createdBy,
          selectedUsers: notificationEvent.selectedUsers,
          selectedRoles: notificationEvent.selectedRoles,
          selectedLocations: notificationEvent.selectedLocations,
          seenBy: notificationEvent.seenBy || [],
          event: '',
          message:
            notificationEvent.message ||
            `${user?.name} at ${countLocation?.name} is completed the count list ${countList?.name}`,
        };

        await this.notificationService.createNotification(
          user,
          notificationDto,
        );
      }
    }
    this.accountingGateway.emitCountChanged(user, count);
    return count;
  }

  async removeCount(user: User, id: string) {
    const count = await this.countModel.findByIdAndRemove(id);
    this.accountingGateway.emitCountChanged(user, count);
    return count;
  }

  async matchProducts() {
    const products = await this.productModel.find();
    const allMenuItems = await this.menuService.findAllItems();
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
    await this.accountingGateway.emitProductChanged();
  }

  async updateMultipleProduct(
    updateMultipleProductDto: UpdateMultipleProduct[],
  ) {
    let errorDatas = [];
    for (const updateDto of updateMultipleProductDto) {
      try {
        const { name, expenseType, brand, vendor } = updateDto;
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

        await this.productModel.findOneAndUpdate(
          { name: name, deleted: false },
          {
            ...(newExpenseTypes.length > 0 && { expenseType: newExpenseTypes }),
            ...(newVendor.length > 0 && { vendor: newVendor }),
            ...(newBrand.length > 0 && { brand: newBrand }),
          },
          { new: true },
        );
      } catch (e) {
        console.log(e);
        errorDatas.push({ ...updateDto, errorNote: 'Error occured' });
      }
    }
    this.accountingGateway.emitProductChanged();
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
          price,
          onlinePrice,
          description,
          image,
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
            console.log(e);
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
          const locations = await this.locationService.findAllLocations();
          newProduct.baseQuantities = locations.map((location) => {
            return {
              location: location._id,
              quantity: 0,
            };
          });
          newProduct._id = usernamify(name);
          await newProduct.save();
          isProductCreated = true;
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
          newMenuItem = await this.menuService.createBulkMenuItemWithProduct({
            name: name,
            category: foundCategory._id,
            price: price,
            ...(onlinePrice ? { onlinePrice } : {}),
            ...(description ? { description } : {}),
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
        console.log(e);
        errorDatas.push({ ...addDto, errorNote: 'Error occured' });
      }
    }

    this.accountingGateway.emitBulkProductAndMenuItemChanged();
    return errorDatas;
  }
  async createStockForAllLocations(user: User) {
    try {
      const products = await this.productModel.find({ deleted: false });
      const locations = await this.locationService.findAllLocations();
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
      this.accountingGateway.emitStockChanged(user, '');
      console.log('All missing stocks created.');
    } catch (error) {
      console.error('Failed to create stocks:', error);
    }
  }
}
