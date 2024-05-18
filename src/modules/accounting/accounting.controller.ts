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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
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
} from './accounting.dto';
import { AccountingService } from './accounting.service';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseType } from './expenseType.schema';
import { Fixture } from './fixture.schema';
import { FixtureInvoice } from './fixtureInvoice.schema';
import { FixtureStock } from './fixtureStock.schema';
import { Invoice } from './invoice.schema';
import { PackageType } from './packageType.schema';
import { Product } from './product.schema';
import { Service } from './service.schema';
import { ServiceInvoice } from './serviceInvoice.schema';
import { Stock } from './stock.schema';
import { StockLocation } from './stockLocation.schema';
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

  @Get('/products/packages')
  updateProductPackages() {
    return this.accountingService.updateProductPackages();
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
  // Fixtures
  @Get('/fixtures')
  getFixtures() {
    return this.accountingService.findAllFixtures();
  }

  @Post('/fixtures')
  createFixture(@Body() createFixtureDto: CreateFixtureDto) {
    return this.accountingService.createFixture(createFixtureDto);
  }

  @Patch('/fixtures/:id')
  updateFixture(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Fixture>,
  ) {
    return this.accountingService.updateFixture(id, updates);
  }

  @Delete('/fixtures/:id')
  deleteFixture(@Param('id') id: string) {
    return this.accountingService.removeFixture(id);
  }
  // Services
  @Get('/services')
  getServices() {
    return this.accountingService.findAllServices();
  }

  @Post('/services')
  createService(@Body() createServiceDto: CreateServiceDto) {
    return this.accountingService.createService(createServiceDto);
  }

  @Patch('/services/:id')
  updateService(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Service>,
  ) {
    return this.accountingService.updateService(id, updates);
  }

  @Delete('/services/:id')
  deleteService(@Param('id') id: string) {
    return this.accountingService.removeService(id);
  }

  // fixture invoices
  @Get('/fixture-invoice')
  getFixtureInvoice() {
    return this.accountingService.findAllFixtureInvoices();
  }

  @Post('/fixture-invoice')
  createFixtureInvoice(
    @ReqUser() user: User,
    @Body() createFixtureInvoiceDto: CreateFixtureInvoiceDto,
  ) {
    return this.accountingService.createFixtureInvoice(
      user,
      createFixtureInvoiceDto,
    );
  }

  @Patch('fixture-invoice/:id')
  updateFixtureInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<FixtureInvoice>,
  ) {
    return this.accountingService.updateFixtureInvoice(user, id, updates);
  }

  @Delete('/fixture-invoice/:id')
  deleteFixtureInvoice(@ReqUser() user: User, @Param('id') id: number) {
    return this.accountingService.removeFixtureInvoice(user, id);
  }

  // service invoices
  @Get('/service-invoice')
  getServiceInvoice() {
    return this.accountingService.findAllServiceInvoices();
  }

  @Post('/service-invoice')
  createServiceInvoice(
    @Body() createServiceInvoiceDto: CreateServiceInvoiceDto,
  ) {
    return this.accountingService.createServiceInvoice(createServiceInvoiceDto);
  }

  @Patch('service-invoice/:id')
  updateServiceInvoice(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<ServiceInvoice>,
  ) {
    return this.accountingService.updateServiceInvoice(id, updates);
  }

  @Delete('/service-invoice/:id')
  deleteServiceInvoice(@Param('id') id: number) {
    return this.accountingService.removeServiceInvoice(id);
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
  // packageTypes
  @Get('/package-types')
  getPackageTypes() {
    return this.accountingService.findAllPackageTypes();
  }

  @Post('/package-types')
  createPackageType(@Body() createPackageTypeDto: CreatePackageTypeDto) {
    return this.accountingService.createPackageType(createPackageTypeDto);
  }

  @Patch('/package-types/:id')
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
  createInvoice(
    @ReqUser() user: User,
    @Body() createInvoiceDto: CreateInvoiceDto,
  ) {
    return this.accountingService.createInvoice(user, createInvoiceDto);
  }

  @Patch('/invoices/transfer_to_fixture_invoice/:id')
  updateInvoiceToFixtureInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
  ) {
    return this.accountingService.transferInvoiceToFixtureInvoice(user, id);
  }

  @Patch('/invoices/transfer_to_service_invoice/:id')
  updateInvoiceToServiceInvoice(@Param('id') id: number) {
    return this.accountingService.transferInvoiceToServiceInvoice(id);
  }
  @Patch('/invoices/transfer_service_invoice_to_invoice/:id')
  updateServiceInvoiceToInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
  ) {
    return this.accountingService.transferServiceInvoiceToInvoice(user, id);
  }
  @Patch('/invoices/transfer_fixture_invoice_to_invoice/:id')
  updateFixtureInvoiceToInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
  ) {
    return this.accountingService.transferFixtureInvoiceToInvoice(user, id);
  }
  @Get('/invoices/update_location')
  updateInvoiceLocation() {
    return this.accountingService.updateInvoicesLocation();
  }

  @Patch('/invoices/:id')
  updateInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Invoice>,
  ) {
    return this.accountingService.updateInvoice(user, id, updates);
  }

  @Delete('/invoices/:id')
  deleteInvoice(@ReqUser() user: User, @Param('id') id: number) {
    return this.accountingService.removeInvoice(user, id);
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
  createStock(@ReqUser() user: User, @Body() createStockDto: CreateStockDto) {
    return this.accountingService.createStock(user, createStockDto);
  }

  @Delete('/stocks/:id')
  deleteStock(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeStock(user, id, 'stock delete');
  }

  @Patch('/stocks/:id')
  updateStock(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Stock>,
  ) {
    return this.accountingService.updateStock(user, id, updates);
  }

  @Post('/stocks/consumpt')
  consumptStock(
    @ReqUser() user: User,
    @Body() consumptStockDto: ConsumptStockDto,
  ) {
    return this.accountingService.consumptStock(user, consumptStockDto);
  }
  // Product Stock History
  @Get('/product-stock-histories')
  getProductStockHistories() {
    return this.accountingService.findAllProductStockHistories();
  }

  @Post('/product-stock-histories')
  createProductStockHistory(
    @Body() createProductStockHistoryDto: CreateProductStockHistoryDto,
  ) {
    return this.accountingService.createProductStockHistory(
      createProductStockHistoryDto,
    );
  }
  // Fixture Stock History
  @Get('/fixture-stock-histories')
  getFixtureStockHistories() {
    return this.accountingService.findAllFixtureStockHistories();
  }

  @Post('/fixture-stock-histories')
  createFixtureStockHistory(
    @Body() createFixtureStockHistoryDto: CreateFixtureStockHistoryDto,
  ) {
    return this.accountingService.createFixtureStockHistory(
      createFixtureStockHistoryDto,
    );
  }

  // Fixture Stocks
  @Get('/fixture-stocks')
  getFixtureStocks() {
    return this.accountingService.findAllFixtureStocks();
  }

  @Post('/fixture-stocks')
  createFixtureStock(
    @ReqUser() user: User,
    @Body() createFixtureStockDto: CreateFixtureStockDto,
  ) {
    return this.accountingService.createFixtureStock(
      user,
      createFixtureStockDto,
    );
  }

  @Patch('/fixture-stocks/:id')
  updateFixtureStock(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<FixtureStock>,
  ) {
    return this.accountingService.updateFixtureStock(user, id, updates);
  }

  @Delete('/fixture-stocks/:id')
  deleteFixtureStock(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeFixtureStock(user, id, 'stock delete');
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
}
