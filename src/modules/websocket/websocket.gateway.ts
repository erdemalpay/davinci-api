import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { extractRefId } from 'src/utils/tsUtils';
import { Stock } from '../accounting/stock.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Notification } from '../notification/notification.schema';
import { Collection } from '../order/collection.schema';
import { Order } from '../order/order.schema';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';

@WSGateway({ path: '/socket.io' })
export class AppWebSocketGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly redisService: RedisService) {}

  afterInit() {
    // Disable the default EventEmitter listener limit
    this.server.setMaxListeners(0);
  }
  emitActionChanged() {
    this.server.emit('actionChanged');
  }

  emitActivityChanged() {
    this.server.emit('activityChanged');
  }

  emitAssetChanged() {
    this.server.emit('assetChanged');
  }

  async emitAuthorizationChanged() {
    await this.redisService.reset(RedisKeys.Authorizations);
    this.server.emit('authorizationChanged');
  }

  emitBrandChanged() {
    this.server.emit('brandChanged');
  }

  emitBreakChanged() {
    this.server.emit('breakChanged');
  }

  emitGameplayTimeChanged() {
    this.server.emit('gameplayTimeChanged');
  }

  async emitBulkProductAndMenuItemChanged() {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    await this.redisService.reset(RedisKeys.MenuItems);
    this.server.emit('bulkProductAndMenuItemChanged');
  }

  emitButtonCallChanged() {
    this.server.emit('buttonCallChanged');
  }

  emitCafeActivityChanged() {
    this.server.emit('cafeActivityChanged');
  }

  emitCashoutChanged() {
    this.server.emit('cashoutChanged');
  }

  async emitCategoryChanged() {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.MenuCategories);
    await this.redisService.reset(RedisKeys.ActiveMenuCategories);
    this.server.emit('categoryChanged');
  }

  emitCheckChanged() {
    this.server.emit('checkChanged');
  }

  emitChecklistChanged() {
    this.server.emit('checklistChanged');
  }

  emitCheckoutControlChanged() {
    this.server.emit('checkoutControlChanged');
  }

  emitCollectionChanged(collection: Collection) {
    this.server.emit('collectionChanged', { collection });
  }

  emitConsumerChanged() {
    this.server.emit('consumerChanged');
  }

  emitCountChanged() {
    this.server.emit('countChanged');
  }

  emitCountListChanged() {
    this.server.emit('countListChanged');
  }

  emitCreateMultipleOrder(
    user: User,
    table: Table,
    locationId: number,
    kitchenIds: string[],
  ) {
    this.server.emit('createMultipleOrder', {
      user,
      table,
      locationId,
      kitchenIds,
    });
  }

  emitDisabledConditionChanged() {
    this.server.emit('disabledConditionChanged');
  }

  async emitDiscountChanged() {
    await this.redisService.reset(RedisKeys.Discounts);
    this.server.emit('discountChanged');
  }

  emitEducationChanged() {
    this.server.emit('educationChanged');
  }

  emitExpenseChanged() {
    this.server.emit('expenseChanged');
  }

  emitExpenseTypeChanged() {
    this.server.emit('expenseTypeChanged');
  }

  emitExpirationCountChanged() {
    this.server.emit('expirationCountChanged');
  }

  emitExpirationListChanged() {
    this.server.emit('expirationListChanged');
  }

  emitFeedbackChanged() {
    this.server.emit('feedbackChanged');
  }

  async emitGameChanged() {
    await this.redisService.reset(RedisKeys.GamesMinimal);
    this.server.emit('gameChanged');
  }

  async emitGameplayChanged(user: User, gameplay: Gameplay) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('gameplayChanged', { user, gameplay });
  }

  async emitGameplayCreated(
    user: User,
    gameplay: Gameplay,
    tableId: Table['id'],
  ) {
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('gameplayCreated', { user, gameplay, tableId });
  }

  async emitGameplayUpdated(user: User, gameplay: Gameplay) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('gameplayUpdated', { user, gameplay });
  }

  async emitGameplayDeleted(
    user: User,
    gameplay: Gameplay,
    tableId: Table['id'],
  ) {
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('gameplayDeleted', { user, gameplay, tableId });
  }

  emitIkasProductStockChanged() {
    this.server.emit('ikasProductStockChanged');
  }

  emitShopifyProductStockChanged() {
    this.server.emit('shopifyProductStockChanged');
  }

  emitIncomeChanged() {
    this.server.emit('incomeChanged');
  }

  async emitItemChanged() {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('itemChanged');
  }

  async emitKitchenChanged() {
    await this.redisService.reset(RedisKeys.Kitchens);
    this.server.emit('kitchenChanged');
  }

  async emitLocationChanged(user: User) {
    await this.redisService.reset(RedisKeys.Locations);
    await this.redisService.reset(RedisKeys.AllLocations);
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('locationChanged', user);
  }

  async emitMembershipChanged() {
    await this.redisService.reset(RedisKeys.Memberships);
    this.server.emit('membershipChanged');
  }

  emitNotificationChanged(notifications: Notification[]) {
    this.server.emit('notificationChanged', { notifications });
  }

  emitNotificationRemoved(notification: Notification) {
    this.server.emit('notificationRemoved', { notification });
  }

  async emitOrderCreated(order: Order) {
    await this.redisService.reset(RedisKeys.Tables);
    const normalizedOrder = {
      ...order.toObject(),
      item: extractRefId(order.item),
      kitchen: extractRefId(order.kitchen),
    };
    this.server.emit('orderCreated', { order: normalizedOrder });
  }

  emitOrderGroupChanged() {
    this.server.emit('orderGroupChanged');
  }

  emitOrderNotesChanged() {
    this.server.emit('orderNotesChanged');
  }

  async emitOrderUpdated(orders: Order[]) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('orderUpdated', { orders });
  }

  async emitOrderDeleted(order: Order) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('orderDeleted', { order });
  }

  async emitTodayOrderChanged() {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('todayOrderChanged');
  }

  async emitPageChanged() {
    await this.redisService.reset(RedisKeys.Pages);
    this.server.emit('pageChanged');
  }

  emitPanelSettingsChanged() {
    this.server.emit('panelSettingsChanged');
  }

  emitPaymentChanged() {
    this.server.emit('paymentChanged');
  }

  emitPaymentMethodChanged() {
    this.server.emit('paymentMethodChanged');
  }

  emitPointChanged() {
    this.server.emit('pointChanged');
  }

  emitPointHistoryChanged() {
    this.server.emit('pointHistoryChanged');
  }

  emitPopularChanged() {
    this.server.emit('popularChanged');
  }

  emitProductCategoryChanged() {
    this.server.emit('productCategoryChanged');
  }

  async emitProductChanged() {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('productChanged');
  }

  emitProductStockHistoryChanged() {
    this.server.emit('productStockHistoryChanged');
  }

  emitReservationChanged() {
    this.server.emit('reservationChanged');
  }

  emitRewardChanged() {
    this.server.emit('rewardChanged');
  }

  emitServiceChanged() {
    this.server.emit('serviceChanged');
  }

  emitShiftChangeRequestChanged() {
    this.server.emit('shiftChangeRequestChanged');
  }

  async emitShiftChanged() {
    await this.redisService.reset(RedisKeys.Shifts);
    this.server.emit('shiftChanged');
  }

  async emitSingleTableChanged(table: Partial<Table>) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('singleTableChanged', { table });
  }

  async emitStockChanged() {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.server.emit('stockChanged');
  }
  async emitStockAdded(stock: Stock) {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.server.emit('stockAdded', { stock });
  }

  async emitTableChanged(table: Table) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableChanged', { table });
  }
  async emitTableDeleted(table: Table, user: User) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableDeleted', { table, user });
  }

  async emitTableCreated(table: Table, user: User) {
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('tableCreated', { table, user });
  }
  async emitTableClosed(table: Table, user: User) {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableClosed', { table, user });
  }

  emitTaskTrackChanged() {
    this.server.emit('taskTrackChanged');
  }

  emitUpperCategoryChanged() {
    this.server.emit('upperCategoryChanged');
  }

  async emitUserChanged() {
    await this.redisService.reset(RedisKeys.Users);
    await this.redisService.reset(RedisKeys.MinimalUsers);
    this.server.emit('userChanged');
  }

  emitVendorChanged() {
    this.server.emit('vendorChanged');
  }

  emitVisitChanged() {
    this.server.emit('visitChanged');
  }
}
