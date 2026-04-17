import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { LockInterceptor } from '../lock/lock.interceptor';
import { RaceConditionLockDecorator } from '../lock/race-condition-lock.decorator';
import { RedisKeys } from '../redis/redis.dto';
import { Table } from '../table/table.schema';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  AddOrderToRetailerDto,
  BulkAddOrdersToRetailerDto,
  BulkRemoveOrdersFromRetailerDto,
  CancelHepsiburadaOrderDto,
  CancelIkasOrderDto,
  CancelShopifyOrderDto,
  CancelTrendyolOrderDto,
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  CreateOrderNotesDto,
  CreateRetailerDto,
  OrderQueryDto,
  RetailerOrdersQueryDto,
} from './order.dto';
import { Order } from './order.schema';
import { OrderService } from './order.service';
import { OrderNotes } from './orderNotes.schema';
import { Retailer } from './retailer.schema';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // orders
  @Get()
  findAllOrders() {
    return this.orderService.findAllOrders();
  }

  @Get('/popular-discounts')
  findPopularDiscounts() {
    return this.orderService.findPopularDiscounts();
  }

  @Get('/query')
  findQueryOrders(@Query() query: OrderQueryDto) {
    return this.orderService.findQueryOrders(query);
  }

  @Get('/false-ikas-collections')
  findAllPaidWithCancelledIkasOrders() {
    return this.orderService.findAllPaidWithCancelledIkasOrders();
  }

  @Get('/update-table-date')
  updateOrderTableDates() {
    return this.orderService.updateOrderTableDates();
  }

  @Get('/update-ikas-order-location')
  updateLocationForOrdersWithIkasId() {
    return this.orderService.updateLocationForOrdersWithIkasId();
  }

  @Get('/category_summary')
  categoryBasedOrderSummary(
    @ReqUser() user: User,
    @Query('category') category?: number,
    @Query('location') location?: number,
    @Query('upperCategory') upperCategory?: number,
  ) {
    return this.orderService.categoryBasedOrderSummary(
      user,
      category,
      location,
      upperCategory,
    );
  }

  @Get('/category_summary/compare')
  categorySummaryCompare(
    @Query('primaryAfter') primaryAfter: string,
    @Query('primaryBefore') primaryBefore: string,
    @Query('secondaryAfter') secondaryAfter: string,
    @Query('secondaryBefore') secondaryBefore: string,
    @Query('granularity') granularity: 'daily' | 'monthly',
    @Query('location') location?: number,
    @Query('upperCategory') upperCategory?: number,
    @Query('category') category?: number,
  ) {
    return this.orderService.categorySummaryCompare({
      primaryAfter,
      primaryBefore,
      secondaryAfter,
      secondaryBefore,
      granularity,
      location,
      upperCategory,
      category,
    });
  }

  @Get('/top-order-creators')
  findTopOrderCreators(
    @Query('date') date: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findTopOrderCreators(date, location);
  }

  @Get('/top-order-deliverers')
  findTopOrderDeliverers(
    @Query('date') date: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findTopOrderDeliverers(date, location);
  }

  @Get('/top-order-collections')
  findTopCollectionCreators(
    @Query('date') date: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findTopCollectionCreators(date, location);
  }

  @Get('/avarage-preparation-time')
  findOrderPreparationStats(
    @Query('date') date: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findOrderPreparationStats(date, location);
  }
  @Get('/daily-summary')
  findDailySummary(
    @Query('date') date: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findDailySummary(date, location);
  }

  @Get('/popular-items-last-30-days')
  getPopularItemsLast30Days(@Query('location') location?: number) {
    return this.orderService.getPopularItemsLast30Days(location);
  }
  @Post('/dedupe-ikas-duplicates')
  dedupeIkasDuplicates() {
    return this.orderService.dedupeIkasDuplicates();
  }

  @Get('/remove-zero-quantity')
  removeZeroQuantityOrders() {
    return this.orderService.removeZeroQuantityOrders();
  }

  @Post('/create_order_for_discount')
  createOrderForDiscount(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: {
        totalQuantity: number;
        selectedQuantity: number;
        orderId: number;
      }[];
      discount: number;
      discountPercentage?: number;
      discountAmount?: number;
      discountNote?: string;
    },
  ) {
    return this.orderService.createOrderForDiscount(
      user,
      payload.orders,
      payload.discount,
      payload?.discountPercentage,
      payload?.discountAmount,
      payload?.discountNote,
    );
  }

  @Post('/divide')
  createOrderForDivide(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: {
        totalQuantity: number;
        selectedQuantity: number;
        orderId: number;
      }[];
    },
  ) {
    return this.orderService.createOrderForDivide(user, payload.orders);
  }

  @Post('/cancel_discount')
  cancelDiscountForOrder(
    @ReqUser() user: User,
    @Body()
    payload: {
      orderId: number;
      cancelQuantity: number;
    },
  ) {
    return this.orderService.cancelDiscountForOrder(
      user,
      payload.orderId,
      payload.cancelQuantity,
    );
  }

  @Post()
  createOrder(@ReqUser() user: User, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(user, createOrderDto);
  }
  @Post('/create_multiple')
  createMultipleOrder(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: CreateOrderDto[];
      table: Table;
    },
  ) {
    return this.orderService.createMultipleOrder(
      user,
      payload.orders,
      payload.table,
    );
  }

  @Post('/cancel-ikas-order')
  cancelIkasOrder(@ReqUser() user: User, @Body() payload: CancelIkasOrderDto) {
    return this.orderService.cancelIkasOrder(
      user,
      payload.ikasId,
      payload.quantity,
    );
  }
  @Post('/cancel-shopify-order')
  cancelShopifyOrder(
    @ReqUser() user: User,
    @Body() payload: CancelShopifyOrderDto,
  ) {
    return this.orderService.cancelShopifyOrder(
      user,
      payload.shopifyOrderLineItemId,
      payload.quantity,
    );
  }
  @Post('/cancel-trendyol-order')
  cancelTrendyolOrder(
    @ReqUser() user: User,
    @Body() payload: CancelTrendyolOrderDto,
  ) {
    return this.orderService.cancelTrendyolOrder(
      user,
      payload.trendyolLineItemId,
      payload.quantity,
    );
  }
  @Post('/cancel-hepsiburada-order')
  cancelHepsiburadaOrder(
    @ReqUser() user: User,
    @Body() payload: CancelHepsiburadaOrderDto,
  ) {
    return this.orderService.cancelHepsiburadaOrder(
      user,
      payload.hepsiburadaLineItemId,
      payload.quantity,
    );
  }
  @Post('/migrate-online')
  migrateOnline() {
    return this.orderService.migrateOnline();
  }

  @Post('/migrate-onlineTableOrders')
  migrateOnlineTableOrders() {
    return this.orderService.migrateOnlineTableOrders();
  }

  @Post('/return_order')
  returnOrder(
    @ReqUser() user: User,
    @Body()
    payload: {
      orderId: number;
      returnQuantity: number;
      paymentMethod: string;
    },
  ) {
    return this.orderService.returnOrder(
      user,
      payload.orderId,
      payload.returnQuantity,
      payload.paymentMethod,
    );
  }

  @Post('/table_combine')
  tableCombine(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: Order[];
      oldTableId: number;
      transferredTableId: number;
    },
  ) {
    return this.orderService.tableCombine(
      user,
      payload.orders,
      payload.oldTableId,
      payload.transferredTableId,
    );
  }

  @Post('/table_transfer')
  tableTransfer(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: Order[];
      oldTableId: number;
      transferredTableName: string;
    },
  ) {
    return this.orderService.tableTransfer(
      user,
      payload.orders,
      payload.oldTableId,
      payload.transferredTableName,
    );
  }
  @Post('/selected_order_transfer')
  selectedOrderTransfer(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: {
        totalQuantity: number;
        selectedQuantity: number;
        orderId: number;
      }[];
      transferredTableId: number;
    },
  ) {
    return this.orderService.selectedOrderTransfer(
      user,
      payload.orders,
      payload.transferredTableId,
    );
  }

  @Patch('/update_bulk')
  updateOrders(
    @ReqUser() user: User,
    @Body()
    payload: {
      orders: Order[];
    },
  ) {
    return this.orderService.updateOrders(user, payload.orders);
  }
  @Patch('/update_multiple')
  updateMultipleOrders(
    @ReqUser() user: User,
    @Body()
    payload: {
      ids: number[];
      updates: UpdateQuery<Order>;
    },
  ) {
    return this.orderService.updateMultipleOrders(
      user,
      payload.ids,
      payload.updates,
    );
  }

  @Get('/today')
  findTodayOrders(@Query('after') after: string) {
    return this.orderService.findTodayOrders(after);
  }

  @Get('/collection/today')
  findTodayCollections(@Query('after') after: string) {
    return this.orderService.findTodayCollections(after);
  }

  @Get('/personal')
  findPersonalData(
    @Query('after') after: string,
    @Query('before') before?: string,
    @Query('eliminatedDiscounts') eliminatedDiscounts?: string,
    @Query('location') location?: string,
  ) {
    return this.orderService.findPersonalDatas({
      after: after,
      before: before,
      eliminatedDiscounts: eliminatedDiscounts,
      location: location,
    });
  }

  @Get('/personal_collection')
  findPersonalCollectionNumbers(
    @Query('after') after: string,
    @Query('before') before?: string,
    @Query('location') location?: string,
  ) {
    return this.orderService.findPersonalCollectionNumbers({
      after: after,
      before: before,
      location: location,
    });
  }
  @Get('/table/:id')
  findGivenTableOrders(@Param('id') id: number) {
    return this.orderService.findGivenTableOrders(id);
  }
  @Get('/date')
  findGivenDateOrders(
    @Query('location') location: number,
    @Query('date') date: string,
  ) {
    return this.orderService.findGivenDateOrders(date, location);
  }
  @Patch('/simple/:id')
  simpleUpdateOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: Partial<Order>,
  ) {
    return this.orderService.simpleOrderUpdate(user, id, updates);
  }

  @Patch('/:id/cancel')
  @UseInterceptors(LockInterceptor)
  @RaceConditionLockDecorator({
    key: (req) => `${RedisKeys.OrderLock}:${req.params.id}`,
    ttlSeconds: 10,
  })
  cancelOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Order>,
  ) {
    return this.orderService.updateOrder(user, id, updates);
  }

  @Patch('/:id')
  updateOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Order>,
  ) {
    return this.orderService.updateOrder(user, id, updates);
  }

  //collections
  @Get('/collection')
  findAllCollections() {
    return this.orderService.findAllCollections();
  }
  @Get('/collection/query')
  findQueryCollections(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('location') location?: string,
  ) {
    return this.orderService.findQueryCollections({
      after,
      before,
      location,
    });
  }

  @Get('/collection/summary/query')
  findSummaryCollectionsQuery(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findSummaryCollectionsQuery({
      after,
      before,
      location,
    });
  }

  @Get('/discount/summary/query')
  findSummaryDiscountTotal(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('location') location?: number,
  ) {
    return this.orderService.findSummaryDiscountTotal({
      after,
      before,
      location,
    });
  }

  @Post('/collection/table')
  createCollection(
    @ReqUser() user: User,
    @Body() createCollectionDto: CreateCollectionDto,
  ) {
    return this.orderService.createCollection(user, createCollectionDto);
  }

  @Get('/collection/table/:id')
  findGivenTableCollection(@Param('id') id: number) {
    return this.orderService.findGivenTableCollection(id);
  }

  @Patch('/collection/table/:id')
  updateCollection(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Collection>,
  ) {
    return this.orderService.updateCollection(user, id, updates);
  }

  @Delete('/collection/table/:id')
  deleteCollection(@ReqUser() user: User, @Param('id') id: number) {
    return this.orderService.removeCollection(user, id);
  }
  // discount
  @Get('/discount')
  findAllDiscounts() {
    return this.orderService.findAllDiscounts();
  }

  @Post('/discount')
  createDiscount(
    @ReqUser() user: User,
    @Body() createDiscountDto: CreateDiscountDto,
  ) {
    return this.orderService.createDiscount(user, createDiscountDto);
  }

  @Patch('/discount/:id')
  updateDiscount(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Discount>,
  ) {
    return this.orderService.updateDiscount(user, id, updates);
  }

  @Delete('/discount/:id')
  deleteDiscount(@ReqUser() user: User, @Param('id') id: number) {
    return this.orderService.removeDiscount(user, id);
  }

  // retailer
  @Get('/retailer')
  getAllRetailers() {
    return this.orderService.getAllRetailers();
  }

  @Get('/retailer/:id/orders')
  getRetailerOrders(
    @Param('id') id: number,
    @Query() query: RetailerOrdersQueryDto,
  ) {
    return this.orderService.getRetailerOrders(id, query);
  }

  @Get('/retailer/:id/item-summary')
  getRetailerItemSummary(
    @Param('id') id: number,
    @Query() query: RetailerOrdersQueryDto,
  ) {
    return this.orderService.getRetailerItemSummary(id, query);
  }

  @Post('/retailer')
  createRetailer(
    @ReqUser() user: User,
    @Body() createRetailerDto: CreateRetailerDto,
  ) {
    return this.orderService.createRetailer(user, createRetailerDto);
  }

  @Patch('/retailer/:id')
  updateRetailer(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Retailer>,
  ) {
    return this.orderService.updateRetailer(user, id, updates);
  }

  @Delete('/retailer/:id')
  removeRetailer(@ReqUser() user: User, @Param('id') id: number) {
    return this.orderService.removeRetailer(user, id);
  }

  @Post('/retailer/:id/orders')
  addOrderToRetailer(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() payload: AddOrderToRetailerDto,
  ) {
    return this.orderService.addOrderToRetailer(user, id, payload.orderId);
  }

  @Delete('/retailer/:id/orders/:orderId')
  removeOrderFromRetailer(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Param('orderId') orderId: number,
  ) {
    return this.orderService.removeOrderFromRetailer(user, id, orderId);
  }

  @Post('/retailer/:id/orders/bulk-add')
  bulkAddOrdersToRetailer(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() payload: BulkAddOrdersToRetailerDto,
  ) {
    return this.orderService.bulkAddOrdersToRetailer(
      user,
      id,
      payload.orderIds,
    );
  }

  @Delete('/retailer/:id/orders/bulk-remove')
  bulkRemoveOrdersFromRetailer(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() payload: BulkRemoveOrdersFromRetailerDto,
  ) {
    return this.orderService.bulkRemoveOrdersFromRetailer(
      user,
      id,
      payload.orderIds,
    );
  }

  // order notes
  @Get('/notes')
  findOrderNotes() {
    return this.orderService.findOrderNotes();
  }
  @Post('/notes')
  createOrderNote(@Body() createOrderNoteDto: CreateOrderNotesDto) {
    return this.orderService.createOrderNote(createOrderNoteDto);
  }

  @Patch('/notes/:id')
  updateOrderNote(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<OrderNotes>,
  ) {
    return this.orderService.updateOrderNote(id, updates);
  }
  @Delete('/notes/:id')
  deleteOrderNote(@Param('id') id: number) {
    return this.orderService.removeOrderNote(id);
  }
}
