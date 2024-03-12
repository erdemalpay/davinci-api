import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import {
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreateProductDto,
  CreateUnitDto,
} from './accounting.dto';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { Product } from './product.schema';
import { Unit } from './unit.schema';

export class AccountingService {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Unit.name) private unitModel: Model<Unit>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<Unit>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Unit>,
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
  removeProduct(id: number) {
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
    await this.productModel.updateMany({ unit: id }, { unit: null });
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
  removeExpenseType(id: number) {
    return this.expenseTypeModel.findByIdAndRemove(id);
  }

  // Invoices
  findAllInvoices() {
    return this.invoiceModel.find().populate('product expenseType');
  }
  createInvoice(createInvoiceDto: CreateInvoiceDto) {
    return this.invoiceModel.create(createInvoiceDto);
  }
  updateInvoice(id: number, updates: UpdateQuery<Invoice>) {
    return this.invoiceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeInvoice(id: number) {
    return this.invoiceModel.findByIdAndRemove(id);
  }
}
