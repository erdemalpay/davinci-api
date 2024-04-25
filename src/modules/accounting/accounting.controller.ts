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
import { AccountingService } from './accounting.service';
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
  @Post('/products/join')
  joinProduct(@Body() joinProductDto: JoinProductDto) {
    return this.accountingService.joinProducts(joinProductDto);
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
  // expense categories
  @Get('/expense-categories')
  getExpenseCategory() {
    return this.accountingService.findAllExpenseCategories();
  }
  @Post('/expense-categories')
  createExpenseCategory(
    @Body() createExpenseCategoryDto: CreateExpenseCategoryDto,
  ) {
    return this.accountingService.createExpenseCategory(
      createExpenseCategoryDto,
    );
  }
  @Patch('/expense-categories/:id')
  updateExpenseCategory(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpenseCategory>,
  ) {
    return this.accountingService.updateExpenseCategory(id, updates);
  }

  @Delete('/expense-categories/:id')
  deleteExpenseCategory(@Param('id') id: string) {
    return this.accountingService.removeExpenseCategory(id);
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
  // packageTypes
  @Get('/package-types')
  getPackageTypes() {
    return this.accountingService.findAllPackageTypes();
  }

  @Post('/package-types')
  createPackageType(@Body() createPackageTypeDto: CreatePackageTypeDto) {
    return this.accountingService.createPackageType(createPackageTypeDto);
  }

  @Patch('/c/:id')
  updatePackageType(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<PackageType>,
  ) {
    return this.accountingService.updatePackageType(id, updates);
  }

  @Delete('/package-types/:id')
  deletePackageType(@Param('id') id: string) {
    return this.accountingService.removePackageType(id);
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
  // Stock Location
  @Get('/stock-locations')
  getStockLocations() {
    return this.accountingService.findAllStockLocations();
  }
  @Post('/stock-locations')
  createStockLocation(@Body() createStockLocationDto: CreateStockLocationDto) {
    return this.accountingService.createStockLocation(createStockLocationDto);
  }

  @Patch('/stock-locations/:id')
  updateStockLocation(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<StockLocation>,
  ) {
    return this.accountingService.updateStockLocation(id, updates);
  }

  @Delete('/stock-locations/:id')
  deleteStockLocation(@Param('id') id: string) {
    return this.accountingService.removeStockLocation(id);
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
  @Post('/stocks/consumpt')
  consumptStock(@Body() consumptStockDto: ConsumptStockDto) {
    return this.accountingService.consumptStock(consumptStockDto);
  }

  // count list
  @Get('/count-list')
  getCountList() {
    return this.accountingService.findAllCountLists();
  }

  @Post('/count-list')
  createCountList(@Body() createCountListDto: CreateCountListDto) {
    return this.accountingService.createCountList(createCountListDto);
  }

  @Patch('/count-list/:id')
  updateCountList(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<CountList>,
  ) {
    return this.accountingService.updateCountList(id, updates);
  }

  @Delete('/count-list/:id')
  deleteCountList(@Param('id') id: string) {
    return this.accountingService.removeCountList(id);
  }
  // count
  @Get('/counts')
  getCounts() {
    return this.accountingService.findAllCounts();
  }

  @Post('/counts')
  createCount(@Body() createCountDto: CreateCountDto) {
    return this.accountingService.createCount(createCountDto);
  }

  @Patch('/counts/:id')
  updateCount(@Param('id') id: string, @Body() updates: UpdateQuery<Count>) {
    return this.accountingService.updateCount(id, updates);
  }

  @Get('/products/expenseCategory')
  updateProductCategory() {
    return this.accountingService.updateProductExpenseCategory();
  }
}
