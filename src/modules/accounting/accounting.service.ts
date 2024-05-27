import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { ActivityType } from '../activity/activity.dto';
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
  CreateFixtureDto,
  CreateFixtureInvoiceDto,
  CreateFixtureStockDto,
  CreateFixtureStockHistoryDto,
  CreateInvoiceDto,
  CreatePackageTypeDto,
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
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseType } from './expenseType.schema';
import { Fixture } from './fixture.schema';
import { FixtureInvoice } from './fixtureInvoice.schema';
import { FixtureStock } from './fixtureStock.schema';
import { FixtureStockHistory } from './fixtureStockHistory.schema';
import { Invoice } from './invoice.schema';
import { PackageType } from './packageType.schema';
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
    @InjectModel(Fixture.name) private fixtureModel: Model<Fixture>,
    @InjectModel(Service.name) private serviceModel: Model<Service>,
    @InjectModel(FixtureInvoice.name)
    private fixtureInvoiceModel: Model<FixtureInvoice>,
    @InjectModel(ServiceInvoice.name)
    private serviceInvoiceModel: Model<ServiceInvoice>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(Location.name) private locationModel: Model<Location>,
    @InjectModel(CountList.name) private countListModel: Model<CountList>,
    @InjectModel(Count.name) private countModel: Model<Count>,
    @InjectModel(PackageType.name) private packageTypeModel: Model<PackageType>,
    @InjectModel(ProductStockHistory.name)
    private productStockHistoryModel: Model<ProductStockHistory>,
    @InjectModel(FixtureStockHistory.name)
    private fixtureStockHistoryModel: Model<FixtureStockHistory>,
    @InjectModel(StockLocation.name)
    private stockLocationModel: Model<StockLocation>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
    @InjectModel(FixtureStock.name)
    private fixtureStockModel: Model<FixtureStock>,
    private readonly MenuService: MenuService,
    private readonly activityService: ActivityService,
  ) {}
  //   Products
  findAllProducts() {
    return this.productModel.find().populate('unit');
  }
  async createProduct(createProductDto: CreateProductDto) {
    try {
      const product = new this.productModel(createProductDto);
      product._id =
        usernamify(product.name) + usernamify(createProductDto.unit);
      await product.save();
      return product;
    } catch (error) {
      throw new HttpException(
        'Failed to create product',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async joinProducts(JoinProductDto: JoinProductDto) {
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
      const updatedProducts = countList.products.map((product) =>
        product.product === removedProduct
          ? { ...product, product: stayedProduct }
          : product,
      );
      countList.products = updatedProducts;
      await countList.save();
    }

    // updateStocks
    await this.stockModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );

    // update invoices
    await this.invoiceModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    //update menu items
    await this.MenuService.updateMenuItemProduct(stayedProduct, removedProduct);

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
    return product;
  }

  updateProduct(id: string, updates: UpdateQuery<Product>) {
    return this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeProduct(id: string) {
    await this.checkIsProductRemovable(id);
    await this.stockModel.deleteMany({ product: id }); // removing the 0 amaount stocks
    return this.productModel.findByIdAndRemove(id);
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
  async createUnit(createUnitDto: CreateUnitDto) {
    const unit = new this.unitModel(createUnitDto);
    unit._id = usernamify(unit.name);
    await unit.save();
  }
  updateUnit(id: string, updates: UpdateQuery<Unit>) {
    return this.unitModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeUnit(id: string) {
    const products = await this.productModel.find({ unit: id });
    if (products.length > 0) {
      throw new HttpException(
        'Cannot remove unit with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.unitModel.findByIdAndRemove(id);
  }
  // Fixtures
  findAllFixtures() {
    return this.fixtureModel.find();
  }
  async createFixture(createFixtureDto: CreateFixtureDto) {
    const fixture = new this.fixtureModel(createFixtureDto);
    fixture._id = usernamify(fixture.name);
    await fixture.save();
    return fixture;
  }
  updateFixture(id: string, updates: UpdateQuery<Fixture>) {
    return this.fixtureModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeFixture(id: string) {
    await this.checkIsFixtureRemovable(id);
    await this.fixtureStockModel.deleteMany({ fixture: id }); //removing the 0 amount stocks of the fixture
    return this.fixtureModel.findByIdAndRemove(id);
  }
  async checkIsFixtureRemovable(id: string) {
    const invoices = await this.fixtureInvoiceModel.find({ fixture: id });
    const stocks = await this.fixtureStockModel.find({ fixture: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove fixture with invoices',
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
  }
  // Services
  findAllServices() {
    return this.serviceModel.find();
  }
  async createService(createServiceDto: CreateServiceDto) {
    const service = new this.serviceModel(createServiceDto);
    service._id = usernamify(service.name);
    await service.save();
    return service;
  }

  updateService(id: string, updates: UpdateQuery<Service>) {
    return this.serviceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeService(id: string) {
    const invoices = await this.serviceInvoiceModel.find({ service: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove service with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.serviceModel.findByIdAndRemove(id);
  }
  // Fixture Invoice
  findAllFixtureInvoices() {
    return this.fixtureInvoiceModel
      .find()
      .populate('fixture expenseType brand vendor location')
      .sort({ _id: -1 });
  }
  async createFixtureInvoice(
    user: User,
    createFixtureInvoiceDto: CreateFixtureInvoiceDto,
    status: string,
  ) {
    try {
      const FixtureLastInvoice = await this.fixtureInvoiceModel
        .find({ fixture: createFixtureInvoiceDto.fixture })
        .sort({ date: -1 })
        .limit(1);
      if (
        !FixtureLastInvoice[0] ||
        FixtureLastInvoice[0]?.date <= createFixtureInvoiceDto.date
      ) {
        const updatedUnitPrice = parseFloat(
          (
            createFixtureInvoiceDto.totalExpense /
            createFixtureInvoiceDto.quantity
          ).toFixed(4),
        );

        await this.fixtureModel.findByIdAndUpdate(
          createFixtureInvoiceDto.fixture,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
      }
      // adding invoice amount to fixture stock
      await this.createFixtureStock(user, {
        fixture: createFixtureInvoiceDto.fixture,
        location: createFixtureInvoiceDto.location,
        quantity: createFixtureInvoiceDto.quantity,
        status: status,
      });
      return this.fixtureInvoiceModel.create(createFixtureInvoiceDto);
    } catch (error) {
      throw new HttpException(
        'Invoice creation failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async updateFixtureInvoice(
    user: User,
    id: number,
    updates: UpdateQuery<FixtureInvoice>,
  ) {
    const invoice = await this.fixtureInvoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    if (
      invoice.fixture === updates.fixture &&
      invoice.quantity === updates.quantity &&
      invoice.location === updates.location &&
      invoice.date === updates.date &&
      invoice.packageType === updates.packageType &&
      (invoice.note !== updates.note ||
        invoice.totalExpense !== updates.totalExpense ||
        invoice.brand !== updates.brand ||
        invoice.vendor !== updates.vendor)
    ) {
      await this.fixtureInvoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            brand: updates.brand,
            vendor: updates.vendor,
          },
        },
        { new: true },
      );
    } else if (
      invoice.fixture === updates.fixture &&
      invoice.location === updates.location &&
      invoice.date === updates.date &&
      invoice.brand === updates.brand &&
      invoice.vendor === updates.vendor &&
      invoice.packageType === updates.packageType &&
      (invoice.note !== updates.note ||
        invoice.totalExpense !== updates.totalExpense ||
        invoice.brand !== updates.brand ||
        invoice.vendor !== updates.vendor ||
        invoice.quantity !== updates.quantity)
    ) {
      await this.fixtureInvoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            quantity: updates.quantity,
            brand: updates.brand,
            vendor: updates.vendor,
          },
        },
        { new: true },
      );
      await this.createFixtureStock(user, {
        fixture: updates.fixture,
        location: updates.location,
        quantity: updates.quantity - invoice.quantity,
        status: StockHistoryStatusEnum.EXPENSEUPDATE,
      });
    } else {
      await this.removeFixtureInvoice(
        user,
        id,
        StockHistoryStatusEnum.EXPENSEUPDATEDELETE,
      );
      await this.createFixtureInvoice(
        user,
        {
          fixture: updates.fixture,
          expenseType: updates?.expenseType,
          quantity: updates?.quantity,
          totalExpense: updates?.totalExpense,
          location: updates?.location,
          date: updates.date,
          vendor: updates?.vendor,
          brand: updates?.brand,
          note: updates?.note,
          packageType: updates?.packageType,
        },
        StockHistoryStatusEnum.EXPENSEUPDATEENTRY,
      );
    }
  }
  async removeFixtureInvoice(user: User, id: number, status: string) {
    const invoice = await this.fixtureInvoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    const fixtureLastInvoice = await this.fixtureInvoiceModel
      .find({ fixture: invoice.fixture })
      .sort({ date: -1 });
    if (fixtureLastInvoice[0]?._id === id) {
      await this.fixtureModel.findByIdAndUpdate(
        invoice.fixture,
        {
          unitPrice: fixtureLastInvoice[1]
            ? parseFloat(
                (
                  fixtureLastInvoice[1].totalExpense /
                  fixtureLastInvoice[1].quantity
                ).toFixed(4),
              )
            : 0,
        },
        {
          new: true,
        },
      );
    }
    // updating the stock quantity
    await this.createFixtureStock(user, {
      fixture: invoice.fixture,
      location: invoice.location,
      quantity: -1 * invoice.quantity,
      status: status,
    });
    return this.fixtureInvoiceModel.findByIdAndRemove(id);
  }
  // Service Invoice
  findAllServiceInvoices() {
    return this.serviceInvoiceModel
      .find()
      .populate('service expenseType vendor location')
      .sort({ _id: -1 });
  }
  async createServiceInvoice(createServiceInvoiceDto: CreateServiceInvoiceDto) {
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

        await this.serviceModel.findByIdAndUpdate(
          createServiceInvoiceDto.service,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
      }
      return this.serviceInvoiceModel.create(createServiceInvoiceDto);
    } catch (error) {
      throw new HttpException(
        'Invoice creation failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async updateServiceInvoice(id: number, updates: UpdateQuery<ServiceInvoice>) {
    await this.removeServiceInvoice(id);
    await this.createServiceInvoice({
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
    });
  }
  async removeServiceInvoice(id: number) {
    const invoice = await this.serviceInvoiceModel.findById(id);
    if (!invoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }
    const serviceLastInvoice = await this.serviceInvoiceModel
      .find({ service: invoice.service })
      .sort({ date: -1 });
    if (serviceLastInvoice[0]?._id === id) {
      await this.serviceModel.findByIdAndUpdate(
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
    }
    return this.serviceInvoiceModel.findByIdAndRemove(id);
  }

  //   Expense Types
  findAllExpenseTypes() {
    return this.expenseTypeModel.find();
  }
  async createExpenseType(createExpenseTypeDto: CreateExpenseTypeDto) {
    const expenseType = new this.expenseTypeModel(createExpenseTypeDto);
    expenseType._id = usernamify(expenseType.name);
    await expenseType.save();
  }
  updateExpenseType(id: string, updates: UpdateQuery<ExpenseType>) {
    return this.expenseTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeExpenseType(id: string) {
    const invoices = await this.invoiceModel.find({ expenseType: id });
    if (invoices.length > 0) {
      throw new HttpException(
        'Cannot remove expense type with invoices',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.expenseTypeModel.findByIdAndRemove(id);
  }
  //   Brands
  findAllBrands() {
    return this.brandModel.find();
  }
  async createBrand(createBrandDto: CreateBrandDto) {
    const brand = new this.brandModel(createBrandDto);
    brand._id = usernamify(brand.name);
    await brand.save();
  }
  updateBrand(id: string, updates: UpdateQuery<Brand>) {
    return this.brandModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeBrand(id: string) {
    const products = await this.productModel.find({
      brand: id,
    });
    if (products.length > 0) {
      throw new HttpException(
        'Cannot remove brand with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.brandModel.findByIdAndRemove(id);
  }

  //   Vendors
  findAllVendors() {
    return this.vendorModel.find();
  }
  async createVendor(createVendorDto: CreateVendorDto) {
    const vendor = new this.vendorModel(createVendorDto);
    vendor._id = usernamify(vendor.name);
    await vendor.save();
  }
  updateVendor(id: string, updates: UpdateQuery<Vendor>) {
    return this.vendorModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeVendor(id: string) {
    const products = await this.productModel.find({
      vendor: id,
    });
    if (products.length > 0) {
      throw new HttpException(
        'Cannot remove vendor with products',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.vendorModel.findByIdAndRemove(id);
  }
  // packageType
  findAllPackageTypes() {
    return this.packageTypeModel.find().populate('unit');
  }
  async createPackageType(createPackageTypeDto: CreatePackageTypeDto) {
    const packageType = new this.packageTypeModel(createPackageTypeDto);
    packageType._id = usernamify(packageType.name);
    await packageType.save();
  }
  updatePackageType(id: string, updates: UpdateQuery<PackageType>) {
    return this.packageTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removePackageType(id: string) {
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
    return this.packageTypeModel.findByIdAndRemove(id);
  }

  // Invoices
  findAllInvoices() {
    return this.invoiceModel
      .find()
      .populate('product expenseType brand vendor location packageType')
      .sort({ _id: -1 });
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
        await this.productModel.findByIdAndUpdate(
          createInvoiceDto.product,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
      }
      // adding invoice amount to stock
      await this.createStock(user, {
        product: createInvoiceDto.product,
        location: createInvoiceDto.location,
        quantity: createInvoiceDto.quantity,
        packageType: createInvoiceDto?.packageType,
        status: status,
      });
      return await this.invoiceModel.create(createInvoiceDto);
    } catch (error) {
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
        invoice.vendor !== updates.vendor)
    ) {
      await this.invoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            brand: updates.brand,
            vendor: updates.vendor,
          },
        },
        { new: true },
      );
    } else if (
      invoice.product === updates.product &&
      invoice.location === updates.location &&
      invoice.date === updates.date &&
      invoice.brand === updates.brand &&
      invoice.vendor === updates.vendor &&
      invoice.packageType === updates.packageType &&
      (invoice.note !== updates.note ||
        invoice.totalExpense !== updates.totalExpense ||
        invoice.brand !== updates.brand ||
        invoice.vendor !== updates.vendor ||
        invoice.quantity !== updates.quantity)
    ) {
      await this.invoiceModel.findByIdAndUpdate(
        id,
        {
          $set: {
            totalExpense: updates.totalExpense,
            note: updates.note,
            brand: updates.brand,
            vendor: updates.vendor,
            quantity: updates.quantity,
          },
        },
        { new: true },
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

    //remove from the invoices
    await this.invoiceModel.findByIdAndDelete(id);

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
  }
  async transferInvoiceToFixtureInvoice(user: User, id: number) {
    const foundInvoice = await this.invoiceModel.findById(id);
    if (!foundInvoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }

    const product = await this.productModel.findById(foundInvoice.product);
    if (!product) {
      throw new HttpException('Product not found', HttpStatus.BAD_REQUEST);
    }

    let fixture = await this.fixtureModel.findById(usernamify(product.name));
    if (!fixture) {
      fixture = await this.createFixture({
        name: product.name,
        unitPrice: product?.unitPrice ?? 0,
        expenseType: product?.expenseType,
        vendor: product?.vendor,
        brand: product?.brand,
        unit: product?.unit ?? 'adet',
        packages: product?.packages ?? [
          { package: 'birim', packageUnitPrice: 0 },
        ],
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
      await this.createFixtureInvoice(
        user,
        {
          fixture: fixture._id,
          expenseType: invoice?.expenseType,
          quantity: invoice?.quantity,
          totalExpense: invoice?.totalExpense,
          location: invoice?.location,
          date: invoice.date,
          vendor: invoice?.vendor,
          brand: invoice?.brand,
          note: invoice?.note,
          packageType: invoice?.packageType,
        },
        StockHistoryStatusEnum.TRANSFERINVOICETOFIXTURE,
      );

      try {
        await this.invoiceModel.findByIdAndDelete(invoice._id);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeProductStocks(foundInvoice.product);
      await this.removeProductStocks(usernamify(product.name)); //this is needed for the first product id type which is not including the units
      await this.removeProduct(foundInvoice.product);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the product`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async transferInvoiceToServiceInvoice(id: number) {
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
      service = await this.createService({
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
      await this.createServiceInvoice({
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
      });

      try {
        await this.invoiceModel.findByIdAndDelete(invoice._id);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeProductStocks(foundInvoice.product);
      await this.removeProductStocks(usernamify(product.name)); //this is needed for the first product id type which is not including the units
      await this.removeProduct(foundInvoice.product);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the product`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async transferFixtureInvoiceToInvoice(user: User, id: number) {
    const foundInvoice = await this.fixtureInvoiceModel.findById(id);
    if (!foundInvoice) {
      throw new HttpException('Invoice not found', HttpStatus.BAD_REQUEST);
    }

    const fixture = await this.fixtureModel.findById(foundInvoice.fixture);
    if (!fixture) {
      throw new HttpException('Fixture not found', HttpStatus.BAD_REQUEST);
    }

    let product = await this.productModel.findById(
      usernamify(fixture.name) + usernamify(fixture?.unit ?? ''),
    );

    if (!product) {
      product = await this.createProduct({
        name: fixture.name,
        unitPrice: fixture?.unitPrice ?? 0,
        expenseType: fixture?.expenseType,
        vendor: fixture?.vendor,
        brand: fixture?.brand,
        unit: fixture?.unit ?? 'adet',
        packages: fixture?.packages ?? [
          { package: 'birim', packageUnitPrice: 0 },
        ],
      });
    }

    const invoices = await this.fixtureInvoiceModel.find({
      fixture: foundInvoice.fixture,
    });
    if (invoices.length === 0) {
      throw new HttpException(
        'No invoices found for the fixture',
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
        },
        StockHistoryStatusEnum.TRANSFERFIXTURETOINVOICE,
      );

      try {
        await this.fixtureInvoiceModel.findByIdAndDelete(invoice._id);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeFixtureFixtureStocks(foundInvoice.fixture);
      await this.removeFixture(foundInvoice.fixture);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the fixture`,
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
      product = await this.createProduct({
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
        },
        StockHistoryStatusEnum.TRANSFERSERVICETOINVOICE,
      );

      try {
        await this.serviceInvoiceModel.findByIdAndDelete(invoice._id);
      } catch (error) {
        throw new HttpException(
          'Failed to remove invoice',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      await this.removeFixture(foundInvoice.service);
    } catch (error) {
      throw new HttpException(
        `Failed to remove the service associated with the invoice`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Stocks
  findAllStocks() {
    return this.stockModel.find().populate('product location packageType');
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
        {
          quantity: Number(oldQuantity) + Number(createStockDto.quantity),
        },
        { new: true },
      );
      // create stock history with currentAmount
      await this.createProductStockHistory({
        user: user._id,
        product: createStockDto.product,
        location: createStockDto.location,
        packageType: createStockDto.packageType,
        change: createStockDto.quantity,
        status,
        currentAmount: oldQuantity,
      });
      console.log('here');
      console.log(newStock);
      console.log(existingStock);
      // create Activity
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        existingStock,
        newStock,
      );
    } else {
      const stock = new this.stockModel(stockData);
      stock._id = stockId;
      await stock.save();
      // create Activity
      this.activityService.addActivity(user, ActivityType.CREATE_STOCK, stock);
      // create stock history with currentAmount 0
      await this.createProductStockHistory({
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
  async removeStock(user: User, id: string, status: string) {
    const stock = await this.stockModel
      .findById(id)
      .populate('product packageType');

    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Create stock history with status delete
      await this.createProductStockHistory({
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
      return deletedStock;
    } catch (error) {
      throw new HttpException(
        'Failed to remove stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeProductStocks(id: string) {
    const productStocks = await this.stockModel.find({ product: id });
    const ProductStockHistory = await this.productStockHistoryModel.find({
      product: id,
    });
    for (const stockHistory of ProductStockHistory) {
      await this.productStockHistoryModel.findByIdAndRemove(stockHistory.id);
    }
    for (const stock of productStocks) {
      await this.stockModel.findByIdAndRemove(stock.id);
    }
  }
  async consumptStock(user: User, consumptStockDto: ConsumptStockDto) {
    const stock = await this.stockModel.find({
      product: consumptStockDto.product,
      location: consumptStockDto.location,
      packageType: consumptStockDto.packageType,
    });
    // if stock exist update quantity
    if (stock.length > 0) {
      const existingStock = stock[0];
      const newStock = await this.stockModel.findByIdAndUpdate(
        stock[0]._id,
        {
          quantity: stock[0].quantity - consumptStockDto.quantity,
        },
        { new: true },
      );
      //create Activity
      this.activityService.addUpdateActivity(
        user,
        ActivityType.UPDATE_STOCK,
        existingStock,
        newStock,
      );
      // create stock history with currentAmount
      await this.createProductStockHistory({
        user: user._id,
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        packageType: consumptStockDto.packageType,
        change: -consumptStockDto.quantity,
        status: StockHistoryStatusEnum.CONSUMPTION,
        currentAmount: stock[0].quantity,
      });
      return stock[0];
    } else {
      const newStock = await this.createStock(user, {
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        packageType: consumptStockDto.packageType,
        quantity: -consumptStockDto.quantity,
        status: StockHistoryStatusEnum.CONSUMPTION,
      });
      return newStock;
    }
  }
  // Product Stock History
  findAllProductStockHistories() {
    return this.productStockHistoryModel
      .find()
      .populate('product user packageType location')
      .sort({ createdAt: -1 });
  }
  createProductStockHistory(
    createProductStockHistoryDto: CreateProductStockHistoryDto,
  ) {
    const productStockHistory = new this.productStockHistoryModel({
      ...createProductStockHistoryDto,
      createdAt: new Date(),
    });
    return productStockHistory.save();
  }
  // Fixture Stock History
  findAllFixtureStockHistories() {
    return this.fixtureStockHistoryModel
      .find()
      .populate('fixture user location')
      .sort({ createdAt: -1 });
  }
  createFixtureStockHistory(
    createFixtureStockHistoryDto: CreateFixtureStockHistoryDto,
  ) {
    const fixtureStockHistory = new this.fixtureStockHistoryModel({
      ...createFixtureStockHistoryDto,
      createdAt: new Date(),
    });
    return fixtureStockHistory.save();
  }
  // Fixture Stocks
  findAllFixtureStocks() {
    return this.fixtureStockModel.find().populate('fixture location');
  }

  async createFixtureStock(
    user: User,
    createFixtureStockDto: CreateFixtureStockDto,
  ) {
    const stockId = usernamify(
      createFixtureStockDto.fixture + createFixtureStockDto?.location,
    );
    const { status, ...stockData } = createFixtureStockDto;
    const existingStock = await this.fixtureStockModel.findById(stockId);
    if (existingStock) {
      const oldQuantity = existingStock.quantity;
      existingStock.quantity =
        Number(existingStock.quantity) + Number(createFixtureStockDto.quantity);
      await existingStock.save();
      // create stock history with currentAmount
      await this.createFixtureStockHistory({
        user: user._id,
        fixture: createFixtureStockDto.fixture,
        location: createFixtureStockDto.location,
        change: createFixtureStockDto.quantity,
        status,
        currentAmount: oldQuantity,
      });
    } else {
      const stock = new this.fixtureStockModel(stockData);
      stock._id = stockId;
      await stock.save();
      // create stock history with currentAmount
      await this.createFixtureStockHistory({
        user: user._id,
        fixture: createFixtureStockDto.fixture,
        location: createFixtureStockDto.location,
        change: createFixtureStockDto.quantity,
        status,
        currentAmount: 0,
      });
    }
  }

  async updateFixtureStock(
    user: User,
    id: string,
    updates: UpdateQuery<FixtureStock>,
  ) {
    const stock = await this.fixtureStockModel.findById(id);
    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }
    if (
      stock.fixture === updates.fixture &&
      stock.location === updates.location &&
      stock.quantity !== updates.quantity
    ) {
      await this.createFixtureStock(user, {
        fixture: updates.fixture,
        location: updates.location,
        quantity: updates.quantity - stock.quantity,
        status: StockHistoryStatusEnum.STOCKUPDATE,
      });
    } else {
      await this.removeFixtureStock(
        user,
        id,
        StockHistoryStatusEnum.STOCKUPDATEDELETE,
      );
      await this.createFixtureStock(user, {
        fixture: updates.fixture,
        location: updates.location,
        quantity: updates.quantity,
        status: StockHistoryStatusEnum.STOCKUPDATEENTRY,
      });
    }
  }
  async removeFixtureStock(user: User, id: string, status: string) {
    const stock = await this.fixtureStockModel.findById(id);

    if (!stock) {
      throw new HttpException('Stock not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Create stock history with status delete
      await this.createFixtureStockHistory({
        fixture: stock.fixture,
        location: stock.location,
        currentAmount: stock.quantity,
        change: -1 * stock.quantity,
        status: status,
        user: user._id,
      });

      // Remove the stock item
      return await this.fixtureStockModel.findByIdAndRemove(id);
    } catch (error) {
      throw new HttpException(
        'Failed to remove stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async removeFixtureFixtureStocks(id: string) {
    const fixtureFixtureStocks = await this.fixtureStockModel.find({
      fixture: id,
    });
    const fixtureStockHistory = await this.fixtureStockHistoryModel.find({
      fixture: id,
    });
    for (const history of fixtureStockHistory) {
      await this.fixtureStockHistoryModel.findByIdAndRemove(history.id);
    }
    for (const stock of fixtureFixtureStocks) {
      await this.fixtureStockModel.findByIdAndRemove(stock.id);
    }
  }
  // stockLocation
  findAllStockLocations() {
    return this.stockLocationModel.find();
  }
  createStockLocation(createStockLocationDto: CreateStockLocationDto) {
    const stockLocation = new this.stockLocationModel(createStockLocationDto);
    stockLocation._id = usernamify(stockLocation.name);
    return stockLocation.save();
  }
  updateStockLocation(id: string, updates: UpdateQuery<StockLocation>) {
    return this.stockLocationModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeStockLocation(id: string) {
    return this.stockLocationModel.findByIdAndRemove(id);
  }
  // countlist
  createCountList(createCountListDto: CreateCountListDto) {
    const countList = new this.countListModel(createCountListDto);
    countList._id = usernamify(countList.name);
    countList.locations = ['bahceli', 'neorama'];
    return countList.save();
  }
  findAllCountLists() {
    return this.countListModel.find();
  }
  updateCountList(id: string, updates: UpdateQuery<CountList>) {
    return this.countListModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeCountList(id: string) {
    const counts = await this.countModel.find({ countList: id });
    if (counts.length > 0) {
      throw new HttpException(
        'Cannot remove a count list',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.countListModel.findByIdAndRemove(id);
  }
  // count
  findAllCounts() {
    return this.countModel
      .find()
      .populate('user location countList')
      .sort({ createdAt: -1 });
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
    return count.save();
  }
  updateCount(id: string, updates: UpdateQuery<Count>) {
    return this.countModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async updatePackages() {
    await this.packageTypeModel.updateMany({
      $set: { unit: 'adet' },
    });
  }

  async updateInvoicesLocation() {
    // Assuming the creation of stock locations is handled elsewhere or checked if already exists
    try {
      await this.createStockLocation({ name: 'Bahçeli' });
    } catch (error) {
      throw new HttpException(
        'Error creating stock location',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.createStockLocation({ name: 'Neorama' });
    } catch (error) {
      throw new HttpException(
        'Error creating stock location',
        HttpStatus.BAD_REQUEST,
      );
    }
    const invoices = await this.invoiceModel.find({});
    for (const invoice of invoices) {
      // Update the location based on the previous number value
      switch (invoice.location) {
        case 1:
          invoice.location = 'bahceli';
          break;
        case 2:
          invoice.location = 'neorama';
          break;
      }
      // Save the invoice if the location was updated
      if (invoice.location === 'bahceli' || invoice.location === 'neorama') {
        await invoice.save();
      }
    }
    const fixtureInvoices = await this.fixtureInvoiceModel.find({});
    for (const invoice of fixtureInvoices) {
      // Update the location based on the previous number value
      switch (invoice.location) {
        case 1:
          invoice.location = 'bahceli';
          break;
        case 2:
          invoice.location = 'neorama';
          break;
      }
      // Save the invoice if the location was updated
      if (invoice.location === 'bahceli' || invoice.location === 'neorama') {
        await invoice.save();
      }
    }
    const serviceInvoices = await this.serviceInvoiceModel.find({});
    for (const invoice of serviceInvoices) {
      // Update the location based on the previous number value
      switch (invoice.location) {
        case 1:
          invoice.location = 'bahceli';
          break;
        case 2:
          invoice.location = 'neorama';
          break;
      }
      // Save the invoice if the location was updated
      if (invoice.location === 'bahceli' || invoice.location === 'neorama') {
        await invoice.save();
      }
    }
  }
}
