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
  CreateStockTypeDto,
  CreateUnitDto,
  CreateVendorDto,
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
  createExpenseType(@Body() createExpenseTypeDto: CreateExpenseTypeDto) {
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
  updateBrand(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateBrand(id, updates);
  }

  @Delete('/brands/:id')
  deleteBrand(@Param('id') id: number) {
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
  updateVendor(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateVendor(id, updates);
  }

  @Delete('/vendors/:id')
  deleteVendor(@Param('id') id: number) {
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
  updateInvoice(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
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
  updateStockType(@Param('id') id: number, @Body() updates: UpdateQuery<Unit>) {
    return this.accountingService.updateStockType(id, updates);
  }

  @Delete('/stock-types/:id')
  deleteStockType(@Param('id') id: number) {
    return this.accountingService.removeStockType(id);
  }
}
