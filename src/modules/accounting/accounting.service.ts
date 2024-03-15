import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import {
  CreateBrandDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreateProductDto,
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
    return this.productModel.find().populate('unit');
  }
  createProduct(createProductDto: CreateProductDto) {
    return this.productModel.create(createProductDto);
  }
  updateProduct(id: number, updates: UpdateQuery<Product>) {
    return this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeProduct(id: number) {
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
  createUnit(createUnitDto: CreateUnitDto) {
    return this.unitModel.create(createUnitDto);
  }
  updateUnit(id: number, updates: UpdateQuery<Unit>) {
    return this.unitModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeUnit(id: number) {
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
  createExpenseType(createExpenseTypeDto: CreateExpenseTypeDto) {
    return this.expenseTypeModel.create(createExpenseTypeDto);
  }
  updateExpenseType(id: number, updates: UpdateQuery<ExpenseType>) {
    return this.expenseTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeExpenseType(id: number) {
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
  createBrand(createBrandDto: CreateBrandDto) {
    return this.brandModel.create(createBrandDto);
  }
  updateBrand(id: number, updates: UpdateQuery<Brand>) {
    return this.brandModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeBrand(id: number) {
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
  createVendor(createVendorDto: CreateVendorDto) {
    return this.vendorModel.create(createVendorDto);
  }
  updateVendor(id: number, updates: UpdateQuery<Vendor>) {
    return this.vendorModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeVendor(id: number) {
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
    await this.productModel.findByIdAndUpdate(
      createInvoiceDto.product,
      {
        $set: {
          unitPrice: parseFloat(
            (createInvoiceDto.totalExpense / createInvoiceDto.quantity).toFixed(
              1,
            ),
          ),
        },
      },
      { new: true },
    );

    return this.invoiceModel.create(createInvoiceDto);
  }
  async updateInvoice(id: number, updates: UpdateQuery<Invoice>) {
    if (updates.quantity || updates.totalExpense) {
      const invoice = await this.invoiceModel.findById(id);
      updates.unitPrice = updates.totalExpense / updates.quantity;
      await this.productModel.findByIdAndUpdate(
        invoice.product,
        { unitPrice: updates.unitPrice.toFixed(1) },
        {
          new: true,
        },
      );
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
  createStockType(createStockTypeDto: CreateStockTypeDto) {
    return this.stockTypeModel.create(createStockTypeDto);
  }
  updateStockType(id: number, updates: UpdateQuery<StockType>) {
    return this.stockTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeStockType(id: number) {
    const stocks = await this.stockModel.find({ stockType: id });
    if (stocks.length > 0) {
      throw new Error('Cannot remove stock type with stocks');
    }
    return this.stockTypeModel.findByIdAndRemove(id);
  }
}
