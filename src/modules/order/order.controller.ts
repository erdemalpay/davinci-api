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
import { Table } from '../table/table.schema';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  OrderType,
} from './order.dto';
import { Order } from './order.schema';
import { OrderService } from './order.service';

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
  findQueryOrders(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('discount') discount?: number,
    @Query('createdBy') createdBy?: string,
    @Query('preparedBy') preparedBy?: string,
    @Query('deliveredBy') deliveredBy?: string,
    @Query('cancelledBy') cancelledBy?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('isIkasPickUp') isIkasPickUp?: boolean,
  ) {
    return this.orderService.findQueryOrders({
      after,
      before,
      discount,
      createdBy,
      preparedBy,
      deliveredBy,
      cancelledBy,
      status,
      category,
      location,
      isIkasPickUp,
    });
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
  cancelIkasOrder(
    @ReqUser() user: User,
    @Body()
    payload: {
      ikasId: string;
      quantity: number;
    },
  ) {
    return this.orderService.cancelIkasOrder(
      user,
      payload.ikasId,
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
      orders: OrderType[];
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

  @Get('/personal')
  findPersonalData(
    @Query('after') after: string,
    @Query('before') before?: string,
    @Query('eliminatedDiscounts') eliminatedDiscounts?: string,
  ) {
    return this.orderService.findPersonalDatas({
      after: after,
      before: before,
      eliminatedDiscounts: eliminatedDiscounts,
    });
  }

  @Get('/personal_collection')
  findPersonalCollectionNumbers(
    @Query('after') after: string,
    @Query('before') before?: string,
  ) {
    return this.orderService.findPersonalCollectionNumbers({
      after: after,
      before: before,
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
}
