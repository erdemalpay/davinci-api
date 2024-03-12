import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import {
  CreateInvoiceDto,
  CreateProductDto,
  CreateUnitDto,
} from './accounting.dto';
import { Product } from './product.schema';

import { AccountingService } from './accounting.service';
import { Unit } from './unit.schema';

@Controller('/accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // Products
  @Get('/products')
  getCategories() {
    return this.accountingService.findAllProducts();
  }

  @Post('/products')
  createCategory(@Body() createProductDto: CreateProductDto) {
    return this.accountingService.createProduct(createProductDto);
  }

  @Patch('/products/:id')
  updateCategory(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Product>,
  ) {
    return this.accountingService.updateProduct(id, updates);
  }

  @Delete('/products/:id')
  deleteCategory(@Param('id') id: number) {
    return this.accountingService.removeProduct(id);
  }
  // Units
  @Get('/units')
  getUnits() {
    return this.accountingService.findAllUnits();
  }

  @Post('/units')
  createUnit(@Body() createUnitDto: CreateUnitDto) {
    return this.accountingService.createUnit(createUnitDto);
  }

  @Patch('/units/:id')
  updateUnit(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateUnit(id, updates);
  }

  @Delete('/units/:id')
  deleteUnit(@Param('id') id: number) {
    return this.accountingService.removeUnit(id);
  }

  // Expense Types
  @Get('/expense-types')
  getExpenseTypes() {
    return this.accountingService.findAllExpenseTypes();
  }

  @Post('/expense-types')
  createExpenseType(@Body() createExpenseTypeDto: CreateUnitDto) {
    return this.accountingService.createExpenseType(createExpenseTypeDto);
  }

  @Patch('/expense-types/:id')
  updateExpenseType(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Unit>,
  ) {
    return this.accountingService.updateExpenseType(id, updates);
  }

  @Delete('/expense-types/:id')
  deleteExpenseType(@Param('id') id: number) {
    return this.accountingService.removeExpenseType(id);
  }
  // Invoices
  @Get('/invoices')
  getInvoices() {
    return this.accountingService.findAllInvoices();
  }

  @Post('/invoices')
  createInvoice(@Body() createInvoiceDto: CreateInvoiceDto) {
    return this.accountingService.createInvoice(createInvoiceDto);
  }

  @Patch('/invoices/:id')
  updateInvoice(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateInvoice(id, updates);
  }

  @Delete('/invoices/:id')
  deleteInvoice(@Param('id') id: number) {
    return this.accountingService.removeInvoice(id);
  }
}
