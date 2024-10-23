import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  CreateInvoiceDto,
  CreatePaymentDto,
  CreatePaymentMethodDto,
  CreateProductDto,
  CreateProductStockHistoryDto,
  CreateServiceDto,
  CreateServiceInvoiceDto,
  CreateStockDto,
  CreateStockLocationDto,
  CreateVendorDto,
  JoinProductDto,
  StockHistoryStatusEnum,
} from './accounting.dto';
import { AccountingService } from './accounting.service';
import { Brand } from './brand.schema';
import { Count } from './count.schema';
import { CountList } from './countList.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { Payment } from './payment.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { Product } from './product.schema';
import { Service } from './service.schema';
import { ServiceInvoice } from './serviceInvoice.schema';
import { Stock } from './stock.schema';
import { StockLocation } from './stockLocation.schema';
import { Vendor } from './vendor.schema';

@Controller('/accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}
  // Products
  @Get('/products')
  getProducts() {
    return this.accountingService.findActiveProducts();
  }

  @Get('/all-products')
  getAllProducts() {
    return this.accountingService.findAllProducts();
  }

  @Post('/products')
  createCategory(
    @ReqUser() user: User,
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.accountingService.createProduct(user, createProductDto);
  }
  @Post('/products/join')
  joinProduct(@ReqUser() user: User, @Body() joinProductDto: JoinProductDto) {
    return this.accountingService.joinProducts(user, joinProductDto);
  }
  @Patch('/products/:id')
  updateCategory(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Product>,
  ) {
    return this.accountingService.updateProduct(user, id, updates);
  }

  @Delete('/products/:id')
  deleteCategory(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeProduct(user, id);
  }

  // Services
  @Get('/services')
  getServices() {
    return this.accountingService.findAllServices();
  }

  @Post('/services')
  createService(
    @ReqUser() user: User,
    @Body() createServiceDto: CreateServiceDto,
  ) {
    return this.accountingService.createService(user, createServiceDto);
  }

  @Patch('/services/:id')
  updateService(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Service>,
  ) {
    return this.accountingService.updateService(user, id, updates);
  }

  @Delete('/services/:id')
  deleteService(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeService(user, id);
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
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Payment>,
  ) {
    return this.accountingService.updatePayment(user, id, updates);
  }

  @Delete('/payments/:id')
  deletePayment(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removePayment(user, id);
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
  createStockLocation(
    @ReqUser() user: User,
    @Body() createStockLocationDto: CreateStockLocationDto,
  ) {
    return this.accountingService.createStockLocation(
      user,
      createStockLocationDto,
    );
  }

  @Patch('/stock-locations/:id')
  updateStockLocation(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<StockLocation>,
  ) {
    return this.accountingService.updateStockLocation(user, id, updates);
  }

  @Delete('/stock-locations/:id')
  deleteStockLocation(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeStockLocation(user, id);
  }
  // Stocks
  @Get('/stocks')
  getStock() {
    return this.accountingService.findAllStocks();
  }
  @Get('/stocks/summary/query')
  findQueryStocksTotalValue(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('location') location?: string,
  ) {
    return this.accountingService.findQueryStocksTotalValue({
      after,
      before,
      location,
    });
  }
  @Get('/stocks/query')
  findQueryStocks(@Query('after') after?: string) {
    return this.accountingService.findQueryStocks({
      after: after,
    });
  }
  @Post('/stocks')
  createStock(@ReqUser() user: User, @Body() createStockDto: CreateStockDto) {
    return this.accountingService.createStock(user, createStockDto);
  }
  @Post('/stock_transfer')
  stockTransfer(
    @ReqUser() user: User,
    @Body()
    payload: {
      currentStockLocation: string;
      transferredStockLocation: string;
      product: string;
      quantity: number;
    },
  ) {
    return this.accountingService.stockTransfer(
      user,
      payload.currentStockLocation,
      payload.transferredStockLocation,
      payload.product,
      payload.quantity,
    );
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

  @Get('/fix-stocks')
  fixStocks() {
    return this.accountingService.fixStockIds();
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
    @ReqUser() user: User,
    @Body() createProductStockHistoryDto: CreateProductStockHistoryDto,
  ) {
    return this.accountingService.createProductStockHistory(
      user,
      createProductStockHistoryDto,
    );
  }
  // count list
  @Get('/count-list')
  getCountList() {
    return this.accountingService.findAllCountLists();
  }

  @Post('/count-list')
  createCountList(
    @ReqUser() user: User,
    @Body() createCountListDto: CreateCountListDto,
  ) {
    return this.accountingService.createCountList(user, createCountListDto);
  }

  @Patch('/count-list/:id')
  updateCountList(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<CountList>,
  ) {
    return this.accountingService.updateCountList(user, id, updates);
  }

  @Delete('/count-list/:id')
  deleteCountList(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeCountList(user, id);
  }

  // count
  @Get('/counts')
  getCounts() {
    return this.accountingService.findAllCounts();
  }

  @Post('/counts')
  createCount(@ReqUser() user: User, @Body() createCountDto: CreateCountDto) {
    return this.accountingService.createCount(user, createCountDto);
  }
  @Patch('/stock_equalize')
  updateStockForStockCount(
    @ReqUser() user: User,
    @Body()
    payload: {
      product: string;
      location: string;
      quantity: number;
      currentCountId: number;
    },
  ) {
    return this.accountingService.updateStockForStockCount(
      user,
      payload.product,
      payload.location,
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
  updateCount(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Count>,
  ) {
    return this.accountingService.updateCount(user, id, updates);
  }

  @Delete('/counts/:id')
  deleteCount(@ReqUser() user: User, @Param('id') id: string) {
    return this.accountingService.removeCount(user, id);
  }
}
