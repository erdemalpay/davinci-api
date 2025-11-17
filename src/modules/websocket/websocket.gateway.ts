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

  emitActionChanged(...args: any[]) {
    this.server.emit('actionChanged', ...args);
  }

  emitActivityChanged(...args: any[]) {
    this.server.emit('activityChanged', ...args);
  }

  emitAssetChanged(...args: any[]) {
    this.server.emit('assetChanged', ...args);
  }

  async emitAuthorizationChanged(authorization?: any) {
    await this.redisService.reset(RedisKeys.Authorizations);
    this.server.emit('authorizationChanged', { authorization });
  }

  emitBrandChanged(...args: any[]) {
    this.server.emit('brandChanged', ...args);
  }

  async emitBulkProductAndMenuItemChanged() {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    await this.redisService.reset(RedisKeys.MenuItems);
    this.server.emit('bulkProductAndMenuItemChanged');
  }

  emitButtonCallChanged(...args: any[]) {
    this.server.emit('buttonCallChanged', ...args);
  }

  emitCafeActivityChanged(...args: any[]) {
    this.server.emit('cafeActivityChanged', ...args);
  }

  emitCashoutChanged(...args: any[]) {
    this.server.emit('cashoutChanged', ...args);
  }

  async emitCategoryChanged(user: any, category: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.MenuCategories);
    await this.redisService.reset(RedisKeys.ActiveMenuCategories);
    this.server.emit('categoryChanged', { user, category });
  }

  emitCheckChanged(...args: any[]) {
    this.server.emit('checkChanged', ...args);
  }

  emitChecklistChanged(...args: any[]) {
    this.server.emit('checklistChanged', ...args);
  }

  emitCheckoutControlChanged(...args: any[]) {
    this.server.emit('checkoutControlChanged', ...args);
  }

  emitCollectionChanged(...args: any[]) {
    this.server.emit('collectionChanged', ...args);
  }

  emitConsumerChanged(...args: any[]) {
    this.server.emit('consumerChanged', ...args);
  }

  emitCountChanged(...args: any[]) {
    this.server.emit('countChanged', ...args);
  }

  emitCountListChanged(...args: any[]) {
    this.server.emit('countListChanged', ...args);
  }

  emitCreateMultipleOrder(...args: any[]) {
    this.server.emit('createMultipleOrder', ...args);
  }

  emitDisabledConditionChanged(...args: any[]) {
    this.server.emit('disabledConditionChanged', ...args);
  }

  async emitDiscountChanged(socketUser: any, discount: any) {
    await this.redisService.reset(RedisKeys.Discounts);
    this.server.emit('discountChanged', { socketUser, discount });
  }

  emitEducationChanged(...args: any[]) {
    this.server.emit('educationChanged', ...args);
  }

  emitExpenseChanged(...args: any[]) {
    this.server.emit('expenseChanged', ...args);
  }

  emitExpenseTypeChanged(...args: any[]) {
    this.server.emit('expenseTypeChanged', ...args);
  }

  emitExpirationCountChanged(...args: any[]) {
    this.server.emit('expirationCountChanged', ...args);
  }

  emitExpirationListChanged(...args: any[]) {
    this.server.emit('expirationListChanged', ...args);
  }

  emitFeedbackChanged(...args: any[]) {
    this.server.emit('feedbackChanged', ...args);
  }

  emitGameChanged(...args: any[]) {
    this.server.emit('gameChanged', ...args);
  }

  emitGameplayChanged(...args: any[]) {
    this.server.emit('gameplayChanged', ...args);
  }

  emitIkasProductStockChanged(...args: any[]) {
    this.server.emit('ikasProductStockChanged', ...args);
  }

  emitIncomeChanged(...args: any[]) {
    this.server.emit('incomeChanged', ...args);
  }

  emitInvoiceChanged(...args: any[]) {
    this.server.emit('invoiceChanged', ...args);
  }

  async emitItemChanged(user?: any, item?: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('itemChanged', { user, item });
  }

  emitKitchenChanged(...args: any[]) {
    this.server.emit('kitchenChanged', ...args);
  }

  emitLocationChanged(...args: any[]) {
    this.server.emit('locationChanged', ...args);
  }

  emitMembershipChanged(...args: any[]) {
    this.server.emit('membershipChanged', ...args);
  }

  emitNotificationChanged(...args: any[]) {
    this.server.emit('notificationChanged', ...args);
  }

  emitNotificationRemoved(...args: any[]) {
    this.server.emit('notificationRemoved', ...args);
  }

  emitOrderCreated(...args: any[]) {
    this.server.emit('orderCreated', ...args);
  }

  emitOrderGroupChanged(...args: any[]) {
    this.server.emit('orderGroupChanged', ...args);
  }

  emitOrderNotesChanged(...args: any[]) {
    this.server.emit('orderNotesChanged', ...args);
  }

  emitOrderUpdated(...args: any[]) {
    this.server.emit('orderUpdated', ...args);
  }

  emitPageChanged(...args: any[]) {
    this.server.emit('pageChanged', ...args);
  }

  emitPanelSettingsChanged(...args: any[]) {
    this.server.emit('panelSettingsChanged', ...args);
  }

  emitPaymentChanged(...args: any[]) {
    this.server.emit('paymentChanged', ...args);
  }

  emitPaymentMethodChanged(...args: any[]) {
    this.server.emit('paymentMethodChanged', ...args);
  }

  emitPointChanged(...args: any[]) {
    this.server.emit('pointChanged', ...args);
  }

  emitPointHistoryChanged(...args: any[]) {
    this.server.emit('pointHistoryChanged', ...args);
  }

  emitPopularChanged(...args: any[]) {
    this.server.emit('popularChanged', ...args);
  }

  emitProductCategoryChanged(...args: any[]) {
    this.server.emit('productCategoryChanged', ...args);
  }

  async emitProductChanged(user?: any, product?: any) {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('productChanged', { user, product });
  }

  emitProductStockHistoryChanged(...args: any[]) {
    this.server.emit('productStockHistoryChanged', ...args);
  }

  emitReservationChanged(...args: any[]) {
    this.server.emit('reservationChanged', ...args);
  }

  emitRewardChanged(...args: any[]) {
    this.server.emit('rewardChanged', ...args);
  }

  emitServiceChanged(...args: any[]) {
    this.server.emit('serviceChanged', ...args);
  }

  emitShiftChangeRequestChanged(...args: any[]) {
    this.server.emit('shiftChangeRequestChanged', ...args);
  }

  emitShiftChanged(...args: any[]) {
    this.server.emit('shiftChanged', ...args);
  }

  emitSingleTableChanged(...args: any[]) {
    this.server.emit('singleTableChanged', ...args);
  }

  async emitStockChanged(user?: any, stock?: any) {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.server.emit('stockChanged', { user, stock });
  }

  emitTableChanged(...args: any[]) {
    this.server.emit('tableChanged', ...args);
  }

  emitTaskTrackChanged(...args: any[]) {
    this.server.emit('taskTrackChanged', ...args);
  }

  emitUpperCategoryChanged(...args: any[]) {
    this.server.emit('upperCategoryChanged', ...args);
  }

  async emitUserChanged(user: any) {
    await this.redisService.reset(RedisKeys.Users);
    this.server.emit('userChanged', { user });
  }

  emitVendorChanged(...args: any[]) {
    this.server.emit('vendorChanged', ...args);
  }

  emitVisitChanged(...args: any[]) {
    this.server.emit('visitChanged', ...args);
  }
}
