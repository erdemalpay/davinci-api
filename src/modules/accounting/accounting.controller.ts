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
  CreateFixtureCountDto,
  CreateFixtureCountListDto,
  CreateFixtureDto,
  CreateFixtureInvoiceDto,
  CreateFixtureStockDto,
  CreateFixtureStockHistoryDto,
  CreateInvoiceDto,
  CreatePackageTypeDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
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
import { AccountingService } from './accounting.service';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseType } from './expenseType.schema';
import { Fixture } from './fixture.schema';
import { FixtureCount } from './fixtureCount.schema';
import { FixtureCountList } from './fixtureCountList.schema';
import { FixtureInvoice } from './fixtureInvoice.schema';
import { FixtureStock } from './fixtureStock.schema';
import { Invoice } from './invoice.schema';
import { PackageType } from './packageType.schema';
import { Payment } from './payment.schema';
import { PaymentMethod } from './paymentMethod.schema';
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
  joinProduct(@ReqUser() user: User, @Body() joinProductDto: JoinProductDto) {
    return this.accountingService.joinProducts(user, joinProductDto);
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

  @Get('/update/packages')
  updateProductPackages() {
    return this.accountingService.updatePackages();
  }

  // Units
  @Get('/units')
  getUnits() {
    return this.accountingService.findAllUnits();
  }

  @Post('/units')
  createUnit(@ReqUser() user: User, @Body() createUnitDto: CreateUnitDto) {
    return this.accountingService.createUnit(user, createUnitDto);
  }

  @Patch('/units/:id')
  updateUnit(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Unit>,
  ) {
    return this.accountingService.updateUnit(user, id, updates);
  }

  @Delete('/units/:id')
  deleteUnit(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeUnit(user, id);
  }
  // Fixtures
  @Get('/fixtures')
  getFixtures() {
    return this.accountingService.findAllFixtures();
  }
  @Get('/fixture/games')
  getGamesFixtures(@ReqUser() user: User) {
    return this.accountingService.gamesFixtures(user);
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
      StockHistoryStatusEnum.EXPENSEENTRY,
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
    return this.accountingService.removeFixtureInvoice(
      user,
      id,
      StockHistoryStatusEnum.EXPENSEDELETE,
    );
  }

  // service invoices
  @Get('/service-invoice')
  getServiceInvoice() {
    return this.accountingService.findAllServiceInvoices();
  }

  @Post('/service-invoice')
  createServiceInvoice(
    @ReqUser() user: User,
    @Body() createServiceInvoiceDto: CreateServiceInvoiceDto,
  ) {
    return this.accountingService.createServiceInvoice(
      user,
      createServiceInvoiceDto,
    );
  }

  @Patch('service-invoice/:id')
  updateServiceInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<ServiceInvoice>,
  ) {
    return this.accountingService.updateServiceInvoice(user, id, updates);
  }

  @Delete('/service-invoice/:id')
  deleteServiceInvoice(@ReqUser() user: User, @Param('id') id: number) {
    return this.accountingService.removeServiceInvoice(user, id);
  }
  // Expense Types
  @Get('/expense-types')
  getExpenseTypes() {
    return this.accountingService.findAllExpenseTypes();
  }

  @Post('/expense-types')
  createExpenseType(
    @ReqUser() user: User,
    @Body() createExpenseTypeDto: CreateExpenseTypeDto,
  ) {
    return this.accountingService.createExpenseType(user, createExpenseTypeDto);
  }

  @Patch('/expense-types/:id')
  updateExpenseType(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpenseType>,
  ) {
    return this.accountingService.updateExpenseType(user, id, updates);
  }

  @Delete('/expense-types/:id')
  deleteExpenseType(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeExpenseType(user, id);
  }

  // Brands
  @Get('/brands')
  getBrands() {
    return this.accountingService.findAllBrands();
  }

  @Post('/brands')
  createBrand(@ReqUser() user: User, @Body() createBrandDto: CreateBrandDto) {
    return this.accountingService.createBrand(user, createBrandDto);
  }

  @Patch('/brands/:id')
  updateBrand(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Brand>,
  ) {
    return this.accountingService.updateBrand(user, id, updates);
  }

  @Delete('/brands/:id')
  deleteBrand(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeBrand(user, id);
  }

  // Vendors
  @Get('/vendors')
  getVendors() {
    return this.accountingService.findAllVendors();
  }

  @Post('/vendors')
  createVendor(
    @ReqUser() user: User,
    @Body() createVendorDto: CreateVendorDto,
  ) {
    return this.accountingService.createVendor(user, createVendorDto);
  }

  @Patch('/vendors/:id')
  updateVendor(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Vendor>,
  ) {
    return this.accountingService.updateVendor(user, id, updates);
  }

  @Delete('/vendors/:id')
  deleteVendor(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeVendor(user, id);
  }
  // packageTypes
  @Get('/package-types')
  getPackageTypes() {
    return this.accountingService.findAllPackageTypes();
  }

  @Post('/package-types')
  createPackageType(
    @ReqUser() user: User,
    @Body() createPackageTypeDto: CreatePackageTypeDto,
  ) {
    return this.accountingService.createPackageType(user, createPackageTypeDto);
  }

  @Patch('/package-types/:id')
  updatePackageType(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<PackageType>,
  ) {
    return this.accountingService.updatePackageType(user, id, updates);
  }

  @Delete('/package-types/:id')
  deletePackageType(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removePackageType(user, id);
  }
  // payment methods
  @Get('/payment-methods')
  getPaymentMethods() {
    return this.accountingService.findAllPaymentMethods();
  }

  @Get('/payment-methods/fixPaymentMethods')
  getFixPaymentMethods() {
    return this.accountingService.createFixedPaymentMethods();
  }

  @Post('/payment-methods')
  createPaymentMethod(
    @ReqUser() user: User,
    @Body() createPaymentMethodDto: CreatePaymentMethodDto,
  ) {
    return this.accountingService.createPaymentMethod(
      user,
      createPaymentMethodDto,
    );
  }

  @Patch('/payment-methods/:id')
  updatePaymentMethod(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<PaymentMethod>,
  ) {
    return this.accountingService.updatePaymentMethod(user, id, updates);
  }

  @Delete('/payment-methods/:id')
  deletePaymentMethod(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removePaymentMethod(user, id);
  }
  // payments
  @Get('/payments')
  getPayments() {
    return this.accountingService.findAllPayments();
  }

  @Post('/payments')
  createPayment(
    @ReqUser() user: User,
    @Body() createPaymentDto: CreatePaymentDto,
  ) {
    return this.accountingService.createPayment(user, createPaymentDto);
  }

  @Patch('/payments/:id')
  updatePayment(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Payment>,
  ) {
    return this.accountingService.updatePayment(id, updates);
  }

  @Delete('/payments/:id')
  deletePayment(@Param('id') id: string) {
    return this.accountingService.removePayment(id);
  }

  // Invoices
  @Get('/invoices')
  getInvoices() {
    return this.accountingService.findAllInvoices();
  }
  @Get('/invoices/updatePayment')
  getUpdateInvoicesPayments() {
    return this.accountingService.updateInvoicesPayments();
  }

  @Get('/invoices/updateUser')
  getUpdateInvoicesUser() {
    return this.accountingService.updateInvoicesUser();
  }

  @Post('/invoices')
  createInvoice(
    @ReqUser() user: User,
    @Body() createInvoiceDto: CreateInvoiceDto,
  ) {
    return this.accountingService.createInvoice(
      user,
      createInvoiceDto,
      StockHistoryStatusEnum.EXPENSEENTRY,
    );
  }

  @Patch('/invoices/transfer_to_fixture_invoice/:id')
  updateInvoiceToFixtureInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
  ) {
    return this.accountingService.transferInvoiceToFixtureInvoice(user, id);
  }

  @Patch('/invoices/transfer_to_service_invoice/:id')
  updateInvoiceToServiceInvoice(
    @ReqUser() user: User,
    @Param('id') id: number,
  ) {
    return this.accountingService.transferInvoiceToServiceInvoice(user, id);
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
    return this.accountingService.removeInvoice(
      user,
      id,
      StockHistoryStatusEnum.EXPENSEDELETE,
    );
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
    return this.accountingService.removeStock(
      user,
      id,
      StockHistoryStatusEnum.STOCKDELETE,
    );
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
    return this.accountingService.removeFixtureStock(
      user,
      id,
      StockHistoryStatusEnum.STOCKDELETE,
    );
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

  // Fixture Count List
  @Get('/fixture-count-list')
  getFixtureCountList() {
    return this.accountingService.findAllFixtureCountLists();
  }

  @Post('/fixture-count-list')
  createFixtureCountList(
    @Body() createFixtureCountListDto: CreateFixtureCountListDto,
  ) {
    return this.accountingService.createFixtureCountList(
      createFixtureCountListDto,
    );
  }

  @Patch('/fixture-count-list/:id')
  updateFixtureCountList(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<FixtureCountList>,
  ) {
    return this.accountingService.updateFixtureCountList(id, updates);
  }

  @Delete('/fixture-count-list/:id')
  deleteFixtureCountList(@Param('id') id: string) {
    return this.accountingService.removeFixtureCountList(id);
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
  @Patch('/stock_equalize')
  updateStockForStockCount(
    @ReqUser() user: User,
    @Body()
    payload: {
      product: string;
      location: string;
      packageType: string;
      quantity: number;
      currentCountId: number;
    },
  ) {
    return this.accountingService.updateStockForStockCount(
      user,
      payload.product,
      payload.location,
      payload.packageType,
      payload.quantity,
      payload.currentCountId,
    );
  }
  @Patch('/stock_equalize_bulk')
  updateStockForStockCountBulk(
    @ReqUser() user: User,
    @Body()
    payload: {
      currentCountId: number;
    },
  ) {
    return this.accountingService.updateStockForStockCountBulk(
      user,
      payload.currentCountId,
    );
  }
  @Patch('/counts/:id')
  updateCount(@Param('id') id: string, @Body() updates: UpdateQuery<Count>) {
    return this.accountingService.updateCount(id, updates);
  }

  //fixture count
  @Get('/fixture-counts')
  getFixtureCounts() {
    return this.accountingService.findAllFixtureCounts();
  }

  @Post('/fixture-counts')
  createFixtureCount(@Body() createFixtureCountDto: CreateFixtureCountDto) {
    return this.accountingService.createFixtureCount(createFixtureCountDto);
  }

  @Patch('/fixture-counts/:id')
  updateFixtureCount(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<FixtureCount>,
  ) {
    return this.accountingService.updateFixtureCount(id, updates);
  }
}
