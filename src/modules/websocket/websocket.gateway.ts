import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';

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

  emitCollectionChanged(collection: any) {
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

  emitCreateMultipleOrder(...args: any[]) {
    const [user, table, location, soundRoles, selectedUsers] = args;
    this.server.emit('createMultipleOrder', {
      user,
      table,
      location,
      soundRoles,
      selectedUsers,
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

  async emitGameplayChanged(...args: any[]) {
    const [user, gameplay] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('gameplayChanged', { user, gameplay });
  }

  async emitGameplayCreated(...args: any[]) {
    const [user, gameplay, table] = args;
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('gameplayCreated', { user, gameplay, table });
  }

  async emitGameplayUpdated(...args: any[]) {
    const [user, gameplay] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('gameplayUpdated', { user, gameplay });
  }

  async emitGameplayDeleted(...args: any[]) {
    const [user, gameplay, table] = args;
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('gameplayDeleted', { user, gameplay, table });
  }

  emitIkasProductStockChanged() {
    this.server.emit('ikasProductStockChanged');
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

  async emitLocationChanged() {
    await this.redisService.reset(RedisKeys.Locations);
    await this.redisService.reset(RedisKeys.Locations);
    await this.redisService.reset(RedisKeys.AllLocations);
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('locationChanged');
  }

  async emitMembershipChanged() {
    await this.redisService.reset(RedisKeys.Memberships);
    this.server.emit('membershipChanged');
  }

  emitNotificationChanged(...args: any[]) {
    const [user, notification] = args;
    this.server.emit('notificationChanged', { user, notification });
  }

  emitNotificationRemoved(...args: any[]) {
    const [notification] = args;
    this.server.emit('notificationRemoved', { notification });
  }

  async emitOrderCreated(...args: any[]) {
    const [user, order] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('orderCreated', { user, order });
  }

  emitOrderGroupChanged() {
    this.server.emit('orderGroupChanged');
  }

  emitOrderNotesChanged() {
    this.server.emit('orderNotesChanged');
  }

  async emitOrderUpdated(...args: any[]) {
    const [order] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('orderUpdated', { order });
  }

  async emitOrderDeleted(order: any) {
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

  emitShiftChanged() {
    this.server.emit('shiftChanged');
  }

  async emitSingleTableChanged(...args: any[]) {
    const [table] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('singleTableChanged', { table });
  }

  async emitStockChanged() {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.server.emit('stockChanged');
  }

  async emitTableChanged(...args: any[]) {
    const [table] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableChanged', { table });
  }
  async emitTableDeleted(...args: any[]) {
    const [table] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableDeleted', { table });
  }

  async emitTableCreated(...args: any[]) {
    const [table] = args;
    await this.redisService.reset(RedisKeys.Tables);

    this.server.emit('tableCreated', { table });
  }
  async emitTableClosed(...args: any[]) {
    const [table] = args;
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('tableClosed', { table });
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
