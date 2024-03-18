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
  CreateBrandDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreateProductDto,
  CreateStockDto,
  CreateStockTypeDto,
  CreateUnitDto,
  CreateVendorDto,
} from './accounting.dto';
import { Product } from './product.schema';

import { AccountingService } from './accounting.service';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { Stock } from './stock.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

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
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Product>,
  ) {
    return this.accountingService.updateProduct(id, updates);
  }

  @Delete('/products/:id')
  deleteCategory(@Param('id') id: string) {
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
  updateUnit(@Param('id') id: string, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateUnit(id, updates);
  }

  @Delete('/units/:id')
  deleteUnit(@Param('id') id: string) {
    return this.accountingService.removeUnit(id);
  }

  // Expense Types
  @Get('/expense-types')
  getExpenseTypes() {
    return this.accountingService.findAllExpenseTypes();
  }

  @Post('/expense-types')
  createExpenseType(@Body() createExpenseTypeDto: CreateExpenseTypeDto) {
    return this.accountingService.createExpenseType(createExpenseTypeDto);
  }

  @Patch('/expense-types/:id')
  updateExpenseType(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpenseType>,
  ) {
    return this.accountingService.updateExpenseType(id, updates);
  }

  @Delete('/expense-types/:id')
  deleteExpenseType(@Param('id') id: string) {
    return this.accountingService.removeExpenseType(id);
  }
  // Brands
  @Get('/brands')
  getBrands() {
    return this.accountingService.findAllBrands();
  }

  @Post('/brands')
  createBrand(@Body() createBrandDto: CreateBrandDto) {
    return this.accountingService.createBrand(createBrandDto);
  }

  @Patch('/brands/:id')
  updateBrand(@Param('id') id: string, @Body() updates: UpdateQuery<Brand>) {
    return this.accountingService.updateBrand(id, updates);
  }

  @Delete('/brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.accountingService.removeBrand(id);
  }

  // Vendors
  @Get('/vendors')
  getVendors() {
    return this.accountingService.findAllVendors();
  }

  @Post('/vendors')
  createVendor(@Body() createVendorDto: CreateVendorDto) {
    return this.accountingService.createVendor(createVendorDto);
  }

  @Patch('/vendors/:id')
  updateVendor(@Param('id') id: string, @Body() updates: UpdateQuery<Vendor>) {
    return this.accountingService.updateVendor(id, updates);
  }

  @Delete('/vendors/:id')
  deleteVendor(@Param('id') id: string) {
    return this.accountingService.removeVendor(id);
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
  updateInvoice(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Invoice>,
  ) {
    return this.accountingService.updateInvoice(id, updates);
  }

  @Delete('/invoices/:id')
  deleteInvoice(@Param('id') id: number) {
    return this.accountingService.removeInvoice(id);
  }
  // Stock Types
  @Get('/stock-types')
  getStockTypes() {
    return this.accountingService.findAllStockTypes();
  }

  @Post('/stock-types')
  createStockType(@Body() createStockTypeDto: CreateStockTypeDto) {
    return this.accountingService.createStockType(createStockTypeDto);
  }

  @Patch('/stock-types/:id')
  updateStockType(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<StockType>,
  ) {
    return this.accountingService.updateStockType(id, updates);
  }

  @Delete('/stock-types/:id')
  deleteStockType(@Param('id') id: string) {
    return this.accountingService.removeStockType(id);
  }

  // Stocks
  @Get('/stocks')
  getStock() {
    return this.accountingService.findAllStocks();
  }

  @Post('/stocks')
  createStock(@Body() createStockDto: CreateStockDto) {
    return this.accountingService.createStock(createStockDto);
  }

  @Patch('/stocks/:id')
  updateStock(@Param('id') id: string, @Body() updates: UpdateQuery<Stock>) {
    return this.accountingService.updateStock(id, updates);
  }

  @Delete('/stocks/:id')
  deleteStock(@Param('id') id: string) {
    return this.accountingService.removeStock(id);
  }
  @Get('/removeAll')
  removeAll() {
    return this.accountingService.removeAll();
  }
}
