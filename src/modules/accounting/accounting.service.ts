import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { Location } from '../location/location.schema';
import { MenuService } from './../menu/menu.service';
import {
  ConsumptStockDto,
  CreateBrandDto,
  CreateCountDto,
  CreateCountListDto,
  CreateExpenseCategoryDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreatePackageTypeDto,
  CreateProductDto,
  CreateStockDto,
  CreateStockLocationDto,
  CreateStockTypeDto,
  CreateUnitDto,
  CreateVendorDto,
  JoinProductDto,
} from './accounting.dto';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseCategory } from './expenseCategory.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { PackageType } from './packageType.schema';
import { Product } from './product.schema';
import { Stock } from './stock.schema';
import { StockLocation } from './stockLocation.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

const path = require('path');

export class AccountingService {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Unit.name) private unitModel: Model<Unit>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(ExpenseCategory.name)
    private expenseCategoryModel: Model<ExpenseCategory>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(Location.name) private locationModel: Model<Location>,
    @InjectModel(StockType.name) private stockTypeModel: Model<StockType>,
    @InjectModel(CountList.name) private countListModel: Model<CountList>,
    @InjectModel(Count.name) private countModel: Model<Count>,
    @InjectModel(PackageType.name) private packageTypeModel: Model<PackageType>,
    @InjectModel(StockLocation.name)
    private stockLocationModel: Model<StockLocation>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
    private readonly MenuService: MenuService,
  ) {}
  //   Products
  findAllProducts() {
    return this.productModel.find().populate('unit stockType expenseCategory');
  }
  async createProduct(createProductDto: CreateProductDto) {
    try {
      const product = new this.productModel(createProductDto);
      product._id =
        usernamify(product.name) + usernamify(createProductDto.unit);
      await product.save();
      return product;
    } catch (error) {
      console.error('Failed to create product:', error);
      throw new Error('Failed to create product');
    }
  }
  async joinProducts(JoinProductDto: JoinProductDto) {
    const { stayedProduct, removedProduct } = JoinProductDto;
    const product = await this.productModel.findById(stayedProduct);
    const removedProductDoc = await this.productModel.findById(removedProduct);
    const removeProductInvoices = await this.invoiceModel.find({
      product: removedProduct,
    });
    const menuItems = await this.MenuService.findAllItems();
    const stocks = await this.stockModel.find({ product: removedProduct });
    const countlists = await this.countListModel.find();

    if (
      menuItems.some((item) =>
        item.itemProduction.some(
          (itemProduct) => itemProduct.product === removedProduct,
        ),
      )
    ) {
      throw new Error('Cannot remove product with menu items');
    }
    if (removeProductInvoices.length > 0) {
      throw new Error('Cannot remove product with invoices');
    }
    if (stocks.length > 0) {
      throw new Error('Cannot remove product with stock');
    }
    if (
      countlists.filter((countlist) =>
        countlist.products.some((count) => count === removedProduct),
      ).length > 0
    ) {
      throw new Error('Cannot remove product with countlists');
    }
    //checking the units
    if (product.unit !== removedProductDoc.unit) {
      throw new Error('Unit must be the same');
    }

    // update invoices
    await this.invoiceModel.updateMany(
      { product: removedProduct },
      { $set: { product: stayedProduct } },
    );
    //update menu items
    await this.MenuService.updateMenuItemProduct(stayedProduct, removedProduct);
    // update product
    product.brand = [
      ...new Set([...product.brand, ...removedProductDoc.brand]),
    ];
    product.vendor = [
      ...new Set([...product.vendor, ...removedProductDoc.vendor]),
    ];
    product.expenseType = [
      ...new Set([...product.expenseType, ...removedProductDoc.expenseType]),
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

  async createProductForScript(createProductDto: CreateProductDto) {
    const foundProduct = await this.productModel.findOne({
      name: createProductDto.name,
    });
    if (foundProduct) {
      const updatedBrand = [
        ...new Set(
          [...foundProduct.brand, ...createProductDto.brand].filter(
            (item) => item !== '',
          ),
        ),
      ];
      const updatedVendor = [
        ...new Set(
          [...foundProduct.vendor, ...createProductDto.vendor].filter(
            (item) => item !== '',
          ),
        ),
      ];
      const updatedExpenseType = [
        ...new Set(
          [...foundProduct.expenseType, ...createProductDto.expenseType].filter(
            (item) => item !== '',
          ),
        ),
      ];
      await this.productModel.findByIdAndUpdate(
        foundProduct._id,
        {
          brand: updatedBrand,
          vendor: updatedVendor,
          expenseType: updatedExpenseType,
        },
        {
          new: true,
        },
      );
    } else {
      try {
        const product = new this.productModel(createProductDto);
        product._id = usernamify(product.name);
        await product.save();
      } catch (error) {
        console.error('Failed to create product:', error);
        throw new Error('Failed to create product');
      }
    }
  }
  updateProduct(id: string, updates: UpdateQuery<Product>) {
    return this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeProduct(id: string) {
    const invoices = await this.invoiceModel.find({ product: id });
    const menuItems = await this.MenuService.findAllItems();
    const stocks = await this.stockModel.find({ product: id });
    const countlists = await this.countListModel.find();

    if (
      menuItems.some((item) =>
        item.itemProduction.some((itemProduct) => itemProduct.product === id),
      )
    ) {
      throw new Error('Cannot remove product with menu items');
    }
    if (invoices.length > 0) {
      throw new Error('Cannot remove product with invoices');
    }
    if (stocks.length > 0) {
      throw new Error('Cannot remove product with stock');
    }
    if (
      countlists.filter((countlist) =>
        countlist.products.some((count) => count === id),
      ).length > 0
    ) {
      throw new Error('Cannot remove product with countlists');
    }
    return this.productModel.findByIdAndRemove(id);
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
      throw new Error('Cannot remove unit with products');
    }
    return this.unitModel.findByIdAndRemove(id);
  }
  //   Expense Category
  findAllExpenseCategories() {
    return this.expenseCategoryModel.find();
  }
  async createExpenseCategory(
    createExpenseCategoryDto: CreateExpenseCategoryDto,
  ) {
    const expenseCategory = new this.expenseCategoryModel(
      createExpenseCategoryDto,
    );
    expenseCategory._id = usernamify(createExpenseCategoryDto.name);
    await expenseCategory.save();
  }
  updateExpenseCategory(id: string, updates: UpdateQuery<ExpenseCategory>) {
    return this.expenseCategoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeExpenseCategory(id: string) {
    return this.expenseCategoryModel.findByIdAndRemove(id);
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
      throw new Error('Cannot remove expense type with invoices');
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
      throw new Error('Cannot remove brand with products');
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
      throw new Error('Cannot remove vendor with products');
    }
    return this.vendorModel.findByIdAndRemove(id);
  }
  // packageType
  findAllPackageTypes() {
    return this.packageTypeModel.find();
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
    // TODO : check if there are products with this package type
    // const products = await this.productModel.find();
    // if (products.length > 0) {
    //   throw new Error('Cannot remove package type with products');
    // }
    return this.packageTypeModel.findByIdAndRemove(id);
  }
  // Invoices
  findAllInvoices() {
    return this.invoiceModel
      .find()
      .populate('product expenseType brand vendor location packageType')
      .sort({ date: -1 });
  }
  async createInvoice(createInvoiceDto: CreateInvoiceDto) {
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
          product.packages = product.packages.filter(
            (p) => p.package !== createInvoiceDto.packageType,
          );
          product.packages = [
            ...product.packages,
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
                  (pckg) => pckg.package === item.packageType._id,
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

      return await this.invoiceModel.create(createInvoiceDto);
    } catch (error) {
      console.error(
        `Failed to create invoice: ${createInvoiceDto.product}`,
        error,
      );
      throw new Error('Invoice creation failed.');
    }
  }

  async updateInvoice(id: number, updates: UpdateQuery<Invoice>) {
    if (updates.quantity || updates.totalExpense) {
      const invoice = await this.invoiceModel.findById(id);
      if (!invoice) {
        throw new Error('Invoice not found');
      }
      const ProductLastInvoice = await this.invoiceModel
        .find({ product: invoice.product, packageType: invoice?.packageType })
        .sort({ date: -1 })
        .limit(1);

      if (ProductLastInvoice[0].date <= updates.date) {
        let updatedUnitPrice: number;
        if (updates?.packageType) {
          const packageType = await this.packageTypeModel.findById(
            updates.packageType,
          );
          const updatedPackageTypeUnitPrice = parseFloat(
            (
              updates.totalExpense /
              (updates.quantity * packageType.quantity)
            ).toFixed(4),
          );
          const product = await this.productModel.findById(updates.product);
          product.packages = product.packages.filter(
            (p) => p.package !== updates.packageType,
          );
          product.packages = [
            ...product.packages,
            {
              package: updates.packageType,
              packageUnitPrice: updatedPackageTypeUnitPrice,
            },
          ];
          await product.save();

          const productStocks = await this.stockModel
            .find({ product: updates.product })
            .populate('packageType');

          // calculation the stock overall
          const { productStockOverallExpense, productStockOverallTotal } =
            productStocks.reduce(
              (acc, item) => {
                const foundPackage = product.packages.find(
                  (pckg) => pckg.package === item.packageType._id,
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
            productStockOverallExpense + updates.totalExpense;
          const productTotal =
            productStockOverallTotal + updates.quantity * packageType.quantity;

          updatedUnitPrice = parseFloat(
            (productExpense / productTotal).toFixed(4),
          );
        } else {
          updatedUnitPrice = parseFloat(
            (updates.totalExpense / updates.quantity).toFixed(4),
          );
        }

        await this.productModel.findByIdAndUpdate(
          invoice.product,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
      }
    }
    return this.invoiceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeInvoice(id: number) {
    const invoice = await this.invoiceModel.findById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const ProductLastInvoice = await this.invoiceModel
      .find({ product: invoice.product })
      .sort({ date: -1 });

    if (ProductLastInvoice[0]?._id === id && !invoice.packageType) {
      await this.productModel.findByIdAndUpdate(
        invoice.product,
        {
          unitPrice:
            parseFloat(
              (
                ProductLastInvoice[1]?.totalExpense /
                ProductLastInvoice[1]?.quantity
              ).toFixed(4),
            ) ?? 0,
        },
        {
          new: true,
        },
      );
    } else {
      const packageType = await this.packageTypeModel.findById(
        invoice.packageType,
      );
      const productInvoices = await this.invoiceModel
        .find({ product: invoice.product, packageType: invoice.packageType })
        .sort({ date: -1 });
      const updatedPackageTypeUnitPrice =
        parseFloat(
          (
            productInvoices[1]?.totalExpense /
            (productInvoices[1]?.quantity * packageType.quantity)
          )?.toFixed(4),
        ) ?? 0;
      const product = await this.productModel.findById(invoice.product);
      product.packages = product.packages.filter(
        (p) => p.package !== invoice.packageType,
      );
      product.packages = [
        ...product.packages,
        {
          package: invoice.packageType,
          packageUnitPrice: updatedPackageTypeUnitPrice,
        },
      ];
      const productStocks = await this.stockModel
        .find({ product: invoice.product })
        .populate('packageType');
      // calculation the stock overall
      const { productStockOverallExpense, productStockOverallTotal } =
        productStocks.reduce(
          (acc, item) => {
            const foundPackage = product.packages.find(
              (pckg) => pckg.package === item.packageType._id,
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
      product.unitPrice = parseFloat(
        (
          productStockOverallExpense /
          (productStockOverallTotal !== 0 ? productStockOverallTotal : 1)
        ).toFixed(4),
      );
      await product.save();
    }
    return this.invoiceModel.findByIdAndRemove(id);
  }
  // Stock Type
  findAllStockTypes() {
    return this.stockTypeModel.find();
  }
  async createStockType(createStockTypeDto: CreateStockTypeDto) {
    const stockType = new this.stockTypeModel(createStockTypeDto);
    stockType._id = usernamify(stockType.name);
    await stockType.save();
  }
  updateStockType(id: string, updates: UpdateQuery<StockType>) {
    return this.stockTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeStockType(id: string) {
    const stocks = await this.stockModel.find({ stockType: id });
    if (stocks.length > 0) {
      throw new Error('Cannot remove stock type with stocks');
    }
    return this.stockTypeModel.findByIdAndRemove(id);
  }
  // Stocks
  findAllStocks() {
    return this.stockModel
      .find()
      .populate({
        path: 'product',
        populate: {
          path: 'stockType',
        },
      })
      .populate('location')
      .populate('packageType');
  }

  async createStock(createStockDto: CreateStockDto) {
    const stockId = usernamify(
      createStockDto.product +
        createStockDto?.packageType +
        createStockDto?.location,
    );
    const existStock = await this.stockModel.findById(stockId);
    if (existStock) {
      existStock.quantity =
        Number(existStock.quantity) + Number(createStockDto.quantity);
      await existStock.save();
    } else {
      const stock = new this.stockModel(createStockDto);
      stock._id = stockId;
      await stock.save();
    }
  }

  updateStock(id: string, updates: UpdateQuery<Stock>) {
    return this.stockModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeStock(id: string) {
    return this.stockModel.findByIdAndRemove(id);
  }
  async consumptStock(consumptStockDto: ConsumptStockDto) {
    const stock = await this.stockModel.find({
      product: consumptStockDto.product,
      location: consumptStockDto.location,
    });
    // if stock exist update quantity
    if (stock.length > 0) {
      await this.stockModel.findByIdAndUpdate(stock[0]._id, {
        quantity: stock[0].quantity - consumptStockDto.quantity,
      });
      return stock[0];
    } else {
      const newStock = await this.createStock({
        product: consumptStockDto.product,
        location: consumptStockDto.location,
        quantity: -consumptStockDto.quantity,
      });
      return newStock;
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
    return countList.save();
  }
  findAllCountLists() {
    return this.countListModel.find().populate('location');
  }
  updateCountList(id: string, updates: UpdateQuery<CountList>) {
    return this.countListModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCountList(id: string) {
    return this.countListModel.findByIdAndRemove(id);
  }
  // count
  findAllCounts() {
    return this.countModel.find().populate('user location countList');
  }
  async createCount(createCountDto: CreateCountDto) {
    for (const item of createCountDto.products) {
      const stock = await this.stockModel.find({
        product: item.product,
        location: createCountDto.location,
      });

      if (stock.length > 0) {
        item.stockQuantity = stock[0].quantity;
      } else {
        item.stockQuantity = 0;
      }
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

  async updateProductExpenseCategory() {
    await this.createExpenseCategory({ name: 'Stok' });
    await this.productModel.updateMany({ $set: { expenseCategory: 'stok' } });
  }
}
