import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { ActivityType } from '../activity/activity.dto';
import { CheckoutService } from '../checkout/checkout.service';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { ActivityService } from './../activity/activity.service';
import { MenuService } from './../menu/menu.service';
import {
  ConsumptStockDto,
  CreateBrandDto,
  CreateCountDto,
  CreateCountListDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreatePackageTypeDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
  CreateProductDto,
  CreateProductStockHistoryDto,
  CreateServiceDto,
  CreateServiceInvoiceDto,
  CreateStockDto,
  CreateStockLocationDto,
  CreateUnitDto,
  CreateVendorDto,
  JoinProductDto,
  StockHistoryStatusEnum,
} from './accounting.dto';
import { AccountingGateway } from './accounting.gateway';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { PackageType } from './packageType.schema';
import { Payment } from './payment.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { Product } from './product.schema';
import { ProductStockHistory } from './productStockHistory.schema';
import { Service } from './service.schema';
import { ServiceInvoice } from './serviceInvoice.schema';
import { Stock } from './stock.schema';
import { StockLocation } from './stockLocation.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

const path = require('path');

export class AccountingService {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Unit.name) private unitModel: Model<Unit>,
    @InjectModel(Service.name) private serviceModel: Model<Service>,
    @InjectModel(ServiceInvoice.name)
    private serviceInvoiceModel: Model<ServiceInvoice>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(Location.name) private locationModel: Model<Location>,
    @InjectModel(CountList.name) private countListModel: Model<CountList>,
    @InjectModel(Count.name) private countModel: Model<Count>,
    @InjectModel(PackageType.name) private packageTypeModel: Model<PackageType>,
    @InjectModel(PaymentMethod.name)
    private paymentMethodModel: Model<PaymentMethod>,
    @InjectModel(ProductStockHistory.name)
    private productStockHistoryModel: Model<ProductStockHistory>,
    @InjectModel(StockLocation.name)
    private stockLocationModel: Model<StockLocation>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
    private readonly MenuService: MenuService,
    private readonly activityService: ActivityService,
    private readonly checkoutService: CheckoutService,
    private readonly accountingGateway: AccountingGateway,
  ) {}
  //   Products
  findAllProducts() {
    return this.productModel.find();
  }

  async createNewProductsWithPackage() {
    const packages = await this.packageTypeModel.find();
    const packageMap = new Map<string, PackageType>();
    packages.forEach((p) => {
      packageMap.set(p._id, p);
    });
    const allProducts = await this.productModel.find();
    for (const product of allProducts) {
      for (const packageType of product.packages) {
        const packageObject = packageMap.get(packageType.package);
        if (packageObject.quantity === 1 && packageObject.unit === 'adet') {
          continue;
        }
        const newProduct = await this.productModel.create({
          ...product,
          _id: product._id + '_' + packageType.package,
          name: product.name + ' ' + packageObject.name,
        });
        await this.invoiceModel.updateMany(
          { product: product._id, packageType: packageType.package },
          { $set: { product: newProduct } },
        );
      }
    }
  }

  async createProduct(user: User, createProductDto: CreateProductDto) {
    try {
      const product = new this.productModel(createProductDto);
      product._id =
        usernamify(product.name) + usernamify(createProductDto.unit);
      await product.save();
      this.accountingGateway.emitProductChanged(user, product);
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

    //checking the units
    if (product.unit !== removedProductDoc.unit) {
      throw new HttpException('Unit must be the same', HttpStatus.BAD_REQUEST);
    }
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
    await this.invoiceModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    this.accountingGateway.emitInvoiceChanged(user, stayedProduct);
    //update menu items
    await this.MenuService.updateMenuItemProduct(
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
    product.packages = [
      ...new Set([
        ...product.packages,
        ...removedProductDoc.packages.filter(
          (item) => !product.packages.some((p) => p.package === item.package),
        ),
      ]),
    ];

    // updating the unit price
    const invoices = await this.invoiceModel
      .find({ product: stayedProduct })
      .sort({ date: -1 });
    product.unitPrice =
      parseFloat(
        (invoices[0]?.totalExpense / invoices[0]?.quantity).toFixed(4),
      ) ?? 0;
    await product.save();

    // remove product
    await this.productModel.findByIdAndDelete(removedProduct);
    this.accountingGateway.emitProductChanged(user, product);
    return product;
  }

  async updateProduct(user: User, id: string, updates: UpdateQuery<Product>) {
    const product = await this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.accountingGateway.emitProductChanged(user, product);
    return product;
  }
  async removeProduct(user: User, id: string) {
    await this.checkIsProductRemovable(id);
    await this.stockModel.deleteMany({ product: id }); // removing the 0 amaount stocks
    const product = await this.productModel.findByIdAndRemove(id);
    this.accountingGateway.emitProductChanged(user, product);
    return product;
  }
  async checkIsProductRemovable(id: string) {
    const invoices = await this.invoiceModel.find({ product: id });
    const menuItems = await this.MenuService.findAllItems();
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
  //   Units
  findAllUnits() {
    return this.unitModel.find();
  }
  async createUnit(user: User, createUnitDto: CreateUnitDto) {
    const unit = new this.unitModel(createUnitDto);
    unit._id = usernamify(unit.name);
    await unit.save();
    this.activityService.addActivity(user, ActivityType.CREATE_UNIT, unit);
    this.accountingGateway.emitUnitChanged(user, unit);
    return unit;
  }
  async updateUnit(user: User, id: string, updates: UpdateQuery<Unit>) {
    const oldUnit = await this.unitModel.findById(id);
    const newUnit = await this.unitModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_UNIT,
      oldUnit,
      newUnit,
    );
    this.accountingGateway.emitUnitChanged(user, newUnit);
    return newUnit;
  }
  async removeUnit(user: User, id: string) {
    const products = await this.productModel.find({ unit: id });
    if (products.length > 0) {
      throw new HttpException(
        'Cannot remove unit with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    const unit = await this.unitModel.findByIdAndRemove(id);
    this.activityService.addActivity(user, ActivityType.DELETE_UNIT, unit);
    this.accountingGateway.emitUnitChanged(user, unit);
    return unit;
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
    const invoices = await this.serviceInvoiceModel.find({ service: id });
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
  // Service Invoice
  findAllServiceInvoices() {
    return this.serviceInvoiceModel.find().sort({ _id: -1 });
  }
  async createServiceInvoice(
    user: User,
    createServiceInvoiceDto: CreateServiceInvoiceDto,
  ) {
    try {
      const ServiceLastInvoice = await this.serviceInvoiceModel
        .find({ service: createServiceInvoiceDto.service })
        .sort({ date: -1 })
        .limit(1);
      if (
        !ServiceLastInvoice[0] ||
        ServiceLastInvoice[0]?.date <= createServiceInvoiceDto.date
      ) {
        const updatedUnitPrice = parseFloat(
          (
            createServiceInvoiceDto.totalExpense /
            createServiceInvoiceDto.quantity
          ).toFixed(4),
        );

        const service = await this.serviceModel.findByIdAndUpdate(
          createServiceInvoiceDto.service,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
        this.accountingGateway.emitServiceChanged(user, service);
      }
      const invoice = await this.serviceInvoiceModel.create({
        ...createServiceInvoiceDto,
        user: user._id,
      });
      this.accountingGateway.emitServiceInvoiceChanged(user, invoice);

      if (createServiceInvoiceDto.isPaid) {
        await this.createPayment(user, {
          amount: createServiceInvoiceDto.totalExpense,
          date: createServiceInvoiceDto.date,
          paymentMethod: createServiceInvoiceDto?.paymentMethod,
          vendor: createServiceInvoiceDto.vendor,
          serviceInvoice: invoice._id,
          location: createServiceInvoiceDto.location as string,
        });
      }
      this.activityService.addActivity(
        user,
        ActivityType.CREATE_SERVICEEXPENSE,
        invoice,
      );
      return invoice;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Invoice creation failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async updateServiceInvoice(
    user: User,
    id: number,
    updates: UpdateQuery<ServiceInvoice>,
  ) {
    await this.removeServiceInvoice(user, id);
    await this.createServiceInvoice(user, {
      service: updates.service,
      expenseType: updates?.expenseType,
      quantity: updates?.quantity,
      totalExpense: updates?.totalExpense,
      location: updates?.location,
      date: updates.date,
      vendor: updates?.vendor,
      brand: updates?.brand,
      note: updates?.note,
      packageType: updates?.packageType,
      isPaid: updates?.isPaid,
      paymentMethod: updates?.paymentMethod,
    });
  }
  async removeServiceInvoice(user: User, id: number) {
    const invoice = await this.serviceInvoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    const serviceLastInvoice = await this.serviceInvoiceModel
      .find({ service: invoice.service })
      .sort({ date: -1 });
    if (serviceLastInvoice[0]?._id === id) {
      const service = await this.serviceModel.findByIdAndUpdate(
        invoice.service,
        {
          unitPrice: serviceLastInvoice[1]
            ? parseFloat(
                (
                  serviceLastInvoice[1].totalExpense /
                  serviceLastInvoice[1].quantity
                ).toFixed(4),
              )
            : 0,
        },
        {
          new: true,
        },
      );
      this.accountingGateway.emitServiceChanged(user, service);
    }
    await this.serviceInvoiceModel.findByIdAndRemove(id);
    this.accountingGateway.emitServiceInvoiceChanged(user, invoice);
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_SERVICEEXPENSE,
      invoice,
    );
    // remove payments
    await this.paymentModel.deleteMany({ serviceInvoice: id });
    this.accountingGateway.emitPaymentChanged(user, null);
    return invoice;
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
    const invoices = await this.invoiceModel.find({ expenseType: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove expense type with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    const products = await this.productModel.find({ expenseType: id });
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
  // packageType
  findAllPackageTypes() {
    return this.packageTypeModel.find();
  }
  async createPackageType(
    user: User,
    createPackageTypeDto: CreatePackageTypeDto,
  ) {
    const packageType = new this.packageTypeModel(createPackageTypeDto);
    packageType._id = usernamify(packageType.name);
    await packageType.save();

    this.activityService.addActivity(
      user,
      ActivityType.CREATE_PACKAGETYPE,
      packageType,
    );
    this.accountingGateway.emitPackageTypeChanged(user, packageType);
    return packageType;
  }
  async updatePackageType(
    user: User,
    id: string,
    updates: UpdateQuery<PackageType>,
  ) {
    const oldPackageType = await this.packageTypeModel.findById(id);
    const newPackageType = await this.packageTypeModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_PACKAGETYPE,
      oldPackageType,
      newPackageType,
    );
    this.accountingGateway.emitPackageTypeChanged(user, newPackageType);
    return newPackageType;
  }
  async removePackageType(user: User, id: string) {
    const products = await this.productModel.find();
    const isPackageTypeUsed = products.some((product) =>
      product.packages.some((p) => p.package === id),
    );
    if (isPackageTypeUsed) {
      throw new HttpException(
        'Cannot remove package type with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    const packageType = await this.packageTypeModel.findByIdAndRemove(id);
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_PACKAGETYPE,
      packageType,
    );
    this.accountingGateway.emitPackageTypeChanged(user, packageType);
    return packageType;
  }
  // payment methods
  findAllPaymentMethods() {
    return this.paymentMethodModel.find();
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
    const invoices = await this.invoiceModel.find({ paymentMethod: id });
    const ServiceInvoice = await this.serviceInvoiceModel.find({
      paymentMethod: id,
    });
    if (invoices.length > 0 || ServiceInvoice.length > 0) {
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
  findAllInvoices() {
    return this.invoiceModel.find().sort({ _id: -1 });
  }
  async createInvoice(
    user: User,
    createInvoiceDto: CreateInvoiceDto,
    status: string,
  ) {
    try {
      const ProductLastInvoice = await this.invoiceModel
        .find({ product: createInvoiceDto.product })
        .sort({ date: -1 })
        .limit(1);

      if (
        !ProductLastInvoice[0] ||
        ProductLastInvoice[0]?.date <= createInvoiceDto.date
      ) {
        let updatedUnitPrice: number;
        if (createInvoiceDto?.packageType) {
          const packageType = await this.packageTypeModel.findById(
            createInvoiceDto.packageType,
          );
          const updatedPackageTypeUnitPrice = parseFloat(
            (
              createInvoiceDto.totalExpense /
              (createInvoiceDto.quantity * packageType.quantity)
            ).toFixed(4),
          );
          const product = await this.productModel.findById(
            createInvoiceDto.product,
          );
          product.packages = [
            ...product.packages.filter(
              (p) => p.package !== createInvoiceDto.packageType,
            ),
            {
              package: createInvoiceDto.packageType,
              packageUnitPrice: updatedPackageTypeUnitPrice,
            },
          ];
          await product.save();
          this.accountingGateway.emitProductChanged(user, product);
          const productStocks = await this.stockModel
            .find({ product: createInvoiceDto.product })
            .populate('packageType');

          // calculation the stock overall
          const { productStockOverallExpense, productStockOverallTotal } =
            productStocks.reduce(
              (acc, item) => {
                const foundPackage = product.packages.find(
                  (pckg) => pckg.package === item?.packageType?._id,
                );

                if (foundPackage) {
                  const expense =
                    item.quantity *
                    item.packageType.quantity *
                    foundPackage.packageUnitPrice;
                  acc.productStockOverallExpense += expense;

                  const total = item.quantity * item.packageType.quantity;
                  acc.productStockOverallTotal += total;
                }

                return acc;
              },
              { productStockOverallExpense: 0, productStockOverallTotal: 0 },
            );
          // adding invoice amount to total
          const productExpense =
            productStockOverallExpense + createInvoiceDto.totalExpense;
          const productTotal =
            productStockOverallTotal +
            createInvoiceDto.quantity * packageType.quantity;

          updatedUnitPrice = parseFloat(
            (productExpense / productTotal).toFixed(4),
          );
        } else {
          updatedUnitPrice = parseFloat(
            (createInvoiceDto.totalExpense / createInvoiceDto.quantity).toFixed(
              4,
            ),
          );
        }
        const product = await this.productModel.findByIdAndUpdate(
          createInvoiceDto.product,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
        this.accountingGateway.emitProductChanged(user, product);
      }

      const invoice = await this.invoiceModel.create({
        ...createInvoiceDto,
        user: user._id,
      });
      this.accountingGateway.emitInvoiceChanged(user, invoice);
      if (createInvoiceDto?.isStockIncrement) {
        // adding invoice amount to stock
        await this.createStock(user, {
          product: createInvoiceDto.product,
          location: createInvoiceDto.location,
          quantity: createInvoiceDto.quantity,
          packageType: createInvoiceDto?.packageType,
          status: status,
        });
      }
      if (createInvoiceDto.isPaid) {
        await this.createPayment(user, {
          amount: createInvoiceDto.totalExpense,
          date: createInvoiceDto.date,
          paymentMethod: createInvoiceDto?.paymentMethod,
          vendor: createInvoiceDto.vendor,
          invoice: invoice._id,
          location: createInvoiceDto.location as string,
        });
      }
      this.activityService.addActivity(
        user,
        ActivityType.CREATE_EXPENSE,
        invoice,
      );
      return invoice;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Invoice creation failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async updateInvoice(user: User, id: number, updates: UpdateQuery<Invoice>) {
    const invoice = await this.invoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    if (
      invoice.product === updates.product &&
      invoice.quantity === updates.quantity &&
      invoice.location === updates.location &&
      invoice.date === updates.date &&
      invoice.packageType === updates.packageType &&
      (invoice.note !== updates.note ||
        invoice.totalExpense !== updates.totalExpense ||
        invoice.brand !== updates.brand ||
        invoice.vendor !== updates.vendor ||
        invoice.expenseType !== updates.expenseType ||
        invoice.paymentMethod !== updates.paymentMethod)
    ) {
      const newInvoice = await this.invoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            brand: updates.brand,
            vendor: updates.vendor,
            expenseType: updates.expenseType,
            paymentMethod: updates.paymentMethod,
          },
        },
        { new: true },
      );
      this.accountingGateway.emitInvoiceChanged(user, newInvoice);
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_EXPENSE,
        invoice,
        newInvoice,
      );
    } else if (
      invoice.product === updates.product &&
      invoice.location === updates.location &&
      invoice.date === updates.date &&
      invoice.packageType === updates.packageType &&
      (invoice.note !== updates.note ||
        invoice.totalExpense !== updates.totalExpense ||
        invoice.brand !== updates.brand ||
        invoice.vendor !== updates.vendor ||
        invoice.quantity !== updates.quantity ||
        invoice.expenseType !== updates.expenseType ||
        invoice.paymentMethod !== updates.paymentMethod)
    ) {
      const newInvoice = await this.invoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            brand: updates.brand,
            vendor: updates.vendor,
            quantity: updates.quantity,
            expenseType: updates.expenseType,
            paymentMethod: updates.paymentMethod,
          },
        },
        { new: true },
      );
      this.accountingGateway.emitInvoiceChanged(user, newInvoice);
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_EXPENSE,
        invoice,
        newInvoice,
      );
      await this.createStock(user, {
        product: updates.product,
        location: updates.location,
        quantity: updates.quantity - invoice.quantity,
        packageType: updates?.packageType,
        status: StockHistoryStatusEnum.EXPENSEUPDATE,
      });
    } else {
      await this.removeInvoice(
        user,
        id,
        StockHistoryStatusEnum.EXPENSEUPDATEDELETE,
      );
      await this.createInvoice(
        user,
        {
          product: updates.product,
          expenseType: updates.expenseType,
          quantity: updates.quantity,
          totalExpense: updates.totalExpense,
          location: updates.location,
          date: updates.date,
          brand: updates?.brand,
          vendor: updates?.vendor,
          packageType: updates?.packageType,
          note: updates?.note,
          isPaid: updates?.isPaid,
          paymentMethod: updates?.paymentMethod,
        },
        StockHistoryStatusEnum.EXPENSEUPDATEENTRY,
      );
    }
  }
  async removeInvoice(user: User, id: number, status: string) {
    const invoice = await this.invoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    // removing from the stock
    await this.createStock(user, {
      product: invoice.product,
      location: invoice.location,
      quantity: -1 * invoice.quantity,
      packageType: invoice?.packageType,
      status: status,
    });

    //remove from the invoice
    await this.invoiceModel.findByIdAndDelete(id);
    this.accountingGateway.emitInvoiceChanged(user, invoice);
    this.activityService.addActivity(
      user,
      ActivityType.DELETE_EXPENSE,
      invoice,
    );
    // remove from payments
    await this.paymentModel.deleteMany({ invoice: id });
    this.accountingGateway.emitPaymentChanged(user, null);
    // updating the packagetype unit price
    const product = await this.productModel.findById(invoice.product);
    const invoicePackageType = await this.packageTypeModel.findById(
      invoice?.packageType,
    );
    //  if we have the invoice package type then we will update the unitPrice of that package type
    if (invoicePackageType) {
      const productLastInvoice = await this.invoiceModel
        .find({
          product: invoice.product,
          packageType: invoice.packageType,
        })
        .sort({ date: -1 })
        .limit(1);

      const foundPackageType = await this.packageTypeModel.findById(
        invoice.packageType,
      );
      // if product last invoice exists we will update the unit price or the unit price will be 0

      product.packages =
        productLastInvoice.length > 0
          ? [
              ...product.packages.filter(
                (p) => p.package !== invoice.packageType,
              ),
              {
                package: invoice.packageType,
                packageUnitPrice: parseFloat(
                  (
                    productLastInvoice[0].totalExpense /
                    (productLastInvoice[0].quantity * foundPackageType.quantity)
                  ).toFixed(4),
                ),
              },
            ]
          : [
              ...product.packages.filter(
                (p) => p.package !== invoice.packageType,
              ),
              {
                package: invoice.packageType,
                packageUnitPrice: 0,
              },
            ];
    }
    // updating product overall unit price
    const productStocks = await this.stockModel
      .find({ product: invoice.product })
      .populate('packageType');
    const lastInvoice = await this.invoiceModel
      .find({ product: invoice.product })
      .sort({ date: -1 })
      .limit(1);
    if (invoicePackageType && productStocks.length > 0) {
      // calculation the stock overall
      const { productStockOverallExpense, productStockOverallTotal } =
        productStocks.reduce(
          (acc, item) => {
            const foundPackage = product.packages.find(
              (pckg) => pckg.package === item?.packageType?._id,
            );

            if (foundPackage) {
              const expense =
                (item.quantity > 0 ? item.quantity : 0) *
                (item?.packageType?.quantity ?? 1) *
                foundPackage?.packageUnitPrice;

              acc.productStockOverallExpense += expense;

              const total =
                (item.quantity > 0 ? item.quantity : 0) *
                (item?.packageType?.quantity ?? 1);
              acc.productStockOverallTotal += total;
            }
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
          : lastInvoice.length > 0
          ? parseFloat(
              (lastInvoice[0].totalExpense / lastInvoice[0].quantity).toFixed(
                4,
              ),
            )
          : 0;
    } else {
      product.unitPrice =
        lastInvoice.length > 0
          ? parseFloat(
              (lastInvoice[0].totalExpense / lastInvoice[0].quantity).toFixed(
                4,
              ),
            )
          : 0;
    }

    await product.save();
    this.accountingGateway.emitProductChanged(user, product);
  }

  async transferInvoiceToServiceInvoice(user: User, id: number) {
    const foundInvoice = await this.invoiceModel.findById(id);
    if (!foundInvoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }

    const product = await this.productModel.findById(foundInvoice.product);
    if (!product) {
      throw new HttpException('Product not found', HttpStatus.BAD_REQUEST);
    }
    let service = await this.serviceModel.findById(usernamify(product.name));
    if (!service) {
      service = await this.createService(user, {
        name: product.name,
        unitPrice: product?.unitPrice ?? 0,
        expenseType: product?.expenseType,
        vendor: product?.vendor,
        brand: product?.brand,
        unit: product?.unit,
        packages: product?.packages,
      });
    }

    const invoices = await this.invoiceModel.find({
      product: foundInvoice.product,
    });
    if (invoices.length === 0) {
      throw new HttpException(
        'No invoices found for the product',
        HttpStatus.BAD_REQUEST,
      );
    }

    for (const invoice of invoices) {
      await this.createServiceInvoice(user, {
        service: service._id,
        expenseType: invoice?.expenseType,
        quantity: invoice?.quantity,
        totalExpense: invoice?.totalExpense,
        location: invoice?.location,
        date: invoice.date,
        vendor: invoice?.vendor,
        brand: invoice?.brand,
        note: invoice?.note,
        packageType: invoice?.packageType ?? 'birim',
        isPaid: invoice?.isPaid,
        paymentMethod: invoice?.paymentMethod,
      });

      try {
        await this.invoiceModel.findByIdAndDelete(invoice._id);
        this.accountingGateway.emitInvoiceChanged(user, invoice);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeProductStocks(user, foundInvoice.product);
      await this.removeProductStocks(user, usernamify(product.name)); //this is needed for the first product id type which is not including the units
      await this.removeProduct(user, foundInvoice.product);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the product`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async transferServiceInvoiceToInvoice(user: User, id: number) {
    const foundInvoice = await this.serviceInvoiceModel.findById(id);
    if (!foundInvoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }

    const service = await this.serviceModel.findById(foundInvoice.service);
    if (!service) {
      throw new HttpException('Service not found', HttpStatus.BAD_REQUEST);
    }

    let product = await this.productModel.findById(
      usernamify(service.name) + usernamify(service?.unit),
    );

    if (!product) {
      product = await this.createProduct(user, {
        name: service.name,
        unitPrice: service?.unitPrice ?? 0,
        expenseType: service?.expenseType,
        vendor: service?.vendor,
        brand: service?.brand,
        unit: service?.unit ?? 'adet',
        packages: service?.packages ?? [
          { package: 'birim', packageUnitPrice: 0 },
        ],
      });
    }

    const invoices = await this.serviceInvoiceModel.find({
      service: foundInvoice.service,
    });
    if (!invoices.length) {
      throw new HttpException(
        'No invoices found for the service',
        HttpStatus.BAD_REQUEST,
      );
    }

    for (const invoice of invoices) {
      await this.createInvoice(
        user,
        {
          product: product._id,
          expenseType: invoice?.expenseType,
          quantity: invoice?.quantity,
          totalExpense: invoice?.totalExpense,
          location: invoice?.location,
          date: invoice.date,
          brand: invoice?.brand,
          vendor: invoice?.vendor,
          note: invoice?.note,
          packageType: invoice?.packageType ?? 'birim',
          isPaid: invoice?.isPaid,
          paymentMethod: invoice?.paymentMethod,
        },
        StockHistoryStatusEnum.TRANSFERSERVICETOINVOICE,
      );

      try {
        await this.serviceInvoiceModel.findByIdAndDelete(invoice._id);
        this.accountingGateway.emitInvoiceChanged(user, invoice);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeService(user, foundInvoice.service);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the service associated with the invoice`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Stocks
  findAllStocks() {
    return this.stockModel.find();
  }

  async createStock(user: User, createStockDto: CreateStockDto) {
    const stockId = usernamify(
      createStockDto.product +
        createStockDto?.packageType +
        createStockDto?.location,
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
        packageType: createStockDto.packageType,
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
        packageType: createStockDto.packageType,
        change: createStockDto.quantity,
        status,
        currentAmount: 0,
      });
    }
  }
  async updateStock(user: User, id: string, updates: UpdateQuery<Stock>) {
    const stock = await this.stockModel.findById(id);
    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }
    if (
      stock.product === updates.product &&
      stock.location === updates.location &&
      stock.packageType === updates.packageType &&
      stock.quantity !== updates.quantity
    ) {
      await this.createStock(user, {
        product: updates.product,
        location: updates.location,
        packageType: updates.packageType,
        quantity: updates.quantity - stock.quantity,
        status: StockHistoryStatusEnum.STOCKUPDATE,
      });
    } else {
      await this.removeStock(
        user,
        id,
        StockHistoryStatusEnum.STOCKUPDATEDELETE,
      );
      await this.createStock(user, {
        product: updates.product,
        location: updates.location,
        packageType: updates.packageType,
        quantity: updates.quantity,
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
          product.packageType,
          product.countQuantity,
          currentCountId,
        );
      }
    }
  }
  async updateStockForStockCount(
    user: User,
    product: string,
    location: string,
    packageType: string,
    quantity: number,
    currentCountId: number,
  ) {
    const stock = await this.stockModel.findOne({
      product: product,
      location: location,
      packageType: packageType,
    });

    const count = await this.countModel.updateOne(
      { _id: currentCountId },
      { $set: { 'products.$[elem].isStockEqualized': true } },
      {
        arrayFilters: [
          { 'elem.product': product, 'elem.packageType': packageType },
        ],
      },
    );
    this.accountingGateway.emitCountChanged(user, count);

    await this.createStock(user, {
      product: product,
      location: location,
      packageType: packageType,
      quantity: stock ? quantity - stock.quantity : quantity,
      status: StockHistoryStatusEnum.STOCKEQUALIZE,
    });
  }
  async removeStock(user: User, id: string, status: string) {
    const stock = await this.stockModel
      .findById(id)
      .populate('product packageType');

    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Create stock history with status delete
      await this.createProductStockHistory(user, {
        product: stock.product?._id,
        location: stock.location,
        packageType: stock.packageType?._id,
        currentAmount: stock.quantity,
        change: -1 * stock.quantity,
        status: status,
        user: user._id,
      });
      const deletedStock = await this.stockModel.findByIdAndRemove(id);
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
      packageType: consumptStockDto.packageType,
    });
    if (stock) {
      const newStock = await this.stockModel.findByIdAndUpdate(
        stock._id,
        { $inc: { quantity: -consumptStockDto.quantity } },
        { new: true },
      );
      this.accountingGateway.emitStockChanged(user, newStock);
      await this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        stock,
        newStock,
      );
      await this.createProductStockHistory(user, {
        user: user._id,
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        packageType: consumptStockDto.packageType,
        change: -consumptStockDto.quantity,
        status: consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION,
        currentAmount:
          consumptStockDto.quantity > 0
            ? newStock.quantity + consumptStockDto.quantity
            : stock.quantity,
      });
      return stock;
    } else {
      const newStock = await this.createStock(user, {
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        packageType: consumptStockDto.packageType,
        quantity: -consumptStockDto.quantity,
        status: consumptStockDto?.status ?? StockHistoryStatusEnum.CONSUMPTION,
      });
      return newStock;
    }
  }
  // Product Stock History
  findAllProductStockHistories() {
    return this.productStockHistoryModel.find().sort({ createdAt: -1 });
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
  // stockLocation
  findAllStockLocations() {
    return this.stockLocationModel.find();
  }
  createStockLocation(
    user: User,
    createStockLocationDto: CreateStockLocationDto,
  ) {
    const stockLocation = new this.stockLocationModel(createStockLocationDto);
    stockLocation._id = usernamify(stockLocation.name);
    this.accountingGateway.emitStockLocationChanged(user, stockLocation);
    return stockLocation.save();
  }
  async updateStockLocation(
    user: User,
    id: string,
    updates: UpdateQuery<StockLocation>,
  ) {
    const stockLocation = await this.stockLocationModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.accountingGateway.emitStockLocationChanged(user, stockLocation);
    return stockLocation;
  }
  async removeStockLocation(user: User, id: string) {
    const [
      counts,
      productInvoices,
      payments,
      productStocks,
      serviceInvoices,
      cashouts,
      checkouts,
      incomes,
    ] = await Promise.all([
      this.countModel.find({ location: id }),
      this.invoiceModel.find({ location: id }),
      this.paymentModel.find({ location: id }),
      this.stockModel.find({ location: id }),
      this.serviceInvoiceModel.find({ location: id }),
      this.checkoutService.findAllCashout(),
      this.checkoutService.findAllCheckoutControl(),
      this.checkoutService.findAllIncome(),
    ]);

    // Check if any of the fetched data is associated with the location
    const hasRelatedRecords =
      counts.length > 0 ||
      productInvoices.length > 0 ||
      payments.length > 0 ||
      productStocks.length > 0 ||
      serviceInvoices.length > 0 ||
      cashouts.some((cashout) => (cashout.location as any)._id === id) ||
      checkouts.some((checkout) => (checkout.location as any)._id === id) ||
      incomes.some((income) => (income.location as any)._id === id);

    // Throw an error if the location is associated with any records
    if (hasRelatedRecords) {
      throw new HttpException(
        'Cannot remove a location',
        HttpStatus.BAD_REQUEST,
      );
    }
    const stockLocation = await this.stockLocationModel.findByIdAndRemove(id);
    this.accountingGateway.emitStockLocationChanged(user, stockLocation);
    return stockLocation;
  }
  // countlist
  async createCountList(user: User, createCountListDto: CreateCountListDto) {
    const countList = new this.countListModel(createCountListDto);
    countList._id = usernamify(countList.name);
    countList.locations = ['bahceli', 'neorama'];
    this.accountingGateway.emitCountListChanged(user, countList);
    return countList.save();
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
    this.accountingGateway.emitCountChanged(user, count);
    return count;
  }
  async removeCount(user: User, id: string) {
    const count = await this.countModel.findByIdAndRemove(id);
    this.accountingGateway.emitCountChanged(user, count);
    return count;
  }

  async updatePackages() {
    await this.packageTypeModel.updateMany({
      $set: { unit: 'adet' },
    });
  }

  async updateInvoicesPayments() {
    await this.invoiceModel.updateMany(
      {},
      {
        $set: {
          isPaid: true,
          paymentMethod: 'credit_card',
        },
      },
    );
    await this.serviceInvoiceModel.updateMany(
      {},
      {
        $set: {
          isPaid: true,
          paymentMethod: 'credit_card',
        },
      },
    );
  }
  async updateInvoicesUser() {
    const invoices = await this.invoiceModel.find();
    for (const invoice of invoices) {
      invoice.user = 'cem';
      await invoice.save();
    }
    const serviceInvoices = await this.serviceInvoiceModel.find();
    for (const invoice of serviceInvoices) {
      invoice.user = 'cem';
      await invoice.save();
    }
  }
}
