import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import {
  CreateBrandDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreateProductDto,
  CreateStockDto,
  CreateStockTypeDto,
  CreateUnitDto,
  CreateVendorDto,
} from './accounting.dto';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { Product } from './product.schema';
import { Stock } from './stock.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

export class AccountingService {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Unit.name) private unitModel: Model<Unit>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(StockType.name) private stockTypeModel: Model<StockType>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
  ) {}
  //   Products
  findAllProducts() {
    return this.productModel.find().populate('unit stockType');
  }
  async createProduct(createProductDto: CreateProductDto) {
    const product = new this.productModel(createProductDto);
    product._id = usernamify(product.name);
    await product.save();
  }
  updateProduct(id: string, updates: UpdateQuery<Product>) {
    return this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeProduct(id: string) {
    const invoices = await this.invoiceModel.find({ product: id });
    if (invoices.length > 0) {
      throw new Error('Cannot remove product with invoices');
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

  // Invoices
  findAllInvoices() {
    return this.invoiceModel
      .find()
      .populate('product expenseType brand vendor');
  }
  async createInvoice(createInvoiceDto: CreateInvoiceDto) {
    const ProductLastInvoice = await this.invoiceModel
      .find({ product: createInvoiceDto.product })
      .sort({ date: -1 })
      .limit(1);
    if (
      ProductLastInvoice[0]?.date < createInvoiceDto.date ||
      !ProductLastInvoice[0]
    ) {
      await this.productModel.findByIdAndUpdate(
        createInvoiceDto.product,
        {
          $set: {
            unitPrice: parseFloat(
              (
                createInvoiceDto.totalExpense / createInvoiceDto.quantity
              ).toFixed(1),
            ),
          },
        },
        { new: true },
      );
      await this.stockModel.findOneAndUpdate(
        { product: createInvoiceDto.product },
        {
          $set: {
            unitPrice: parseFloat(
              (
                createInvoiceDto.totalExpense / createInvoiceDto.quantity
              ).toFixed(1),
            ),
          },
        },
        { new: true },
      );
    }

    return this.invoiceModel.create(createInvoiceDto);
  }
  async updateInvoice(id: number, updates: UpdateQuery<Invoice>) {
    if (updates.quantity || updates.totalExpense) {
      const invoice = await this.invoiceModel.findById(id);
      const ProductLastInvoice = await this.invoiceModel
        .find({ product: invoice.product })
        .sort({ date: -1 })
        .limit(1);
      updates.unitPrice = updates.totalExpense / updates.quantity;
      if (ProductLastInvoice[0]._id == id) {
        await this.productModel.findByIdAndUpdate(
          invoice.product,
          { unitPrice: updates.unitPrice.toFixed(1) },
          {
            new: true,
          },
        );
        await this.stockModel.findOneAndUpdate(
          { product: invoice.product },
          { unitPrice: updates.unitPrice.toFixed(1) },
          {
            new: true,
          },
        );
      }
    }
    return this.invoiceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeInvoice(id: number) {
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
    return this.stockModel.find().populate('product location');
  }

  async createStock(createStockDto: CreateStockDto) {
    const stock = new this.stockModel(createStockDto);
    stock._id = usernamify(createStockDto.product + createStockDto.location);
    if (
      stock.unitPrice === 0 ||
      stock.unitPrice === undefined ||
      stock.unitPrice === null
    ) {
      const product = await this.productModel.findById(createStockDto.product);
      stock.unitPrice = product?.unitPrice ?? 0;
    }
    await stock.save();
  }

  updateStock(id: string, updates: UpdateQuery<Stock>) {
    return this.stockModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeStock(id: string) {
    return this.stockModel.findByIdAndRemove(id);
  }
  async removeAll() {
    await this.brandModel.deleteMany({});
    await this.expenseTypeModel.deleteMany({});
    await this.invoiceModel.deleteMany({});
    await this.productModel.deleteMany({});
    await this.stockModel.deleteMany({});
    await this.stockTypeModel.deleteMany({});
    await this.unitModel.deleteMany({});
    await this.vendorModel.deleteMany({});
  }
}
