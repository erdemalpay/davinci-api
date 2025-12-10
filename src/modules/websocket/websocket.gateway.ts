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
    const [action] = args;
    this.server.emit('actionChanged', { action });
  }

  emitActivityChanged(...args: any[]) {
    const [activity] = args;
    this.server.emit('activityChanged', { activity });
  }

  emitAssetChanged(...args: any[]) {
    this.server.emit('assetChanged', ...args);
  }

  async emitAuthorizationChanged(authorization?: any) {
    await this.redisService.reset(RedisKeys.Authorizations);
    this.server.emit('authorizationChanged', { authorization });
  }

  emitBrandChanged(...args: any[]) {
    const [user, brand] = args;
    this.server.emit('brandChanged', { user, brand });
  }

  async emitBulkProductAndMenuItemChanged() {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    await this.redisService.reset(RedisKeys.MenuItems);
    this.server.emit('bulkProductAndMenuItemChanged');
  }

  emitButtonCallChanged(...args: any[]) {
    const [buttonCall] = args;
    this.server.emit('buttonCallChanged', { buttonCall });
  }

  emitCafeActivityChanged(...args: any[]) {
    const [cafeActivity] = args;
    this.server.emit('cafeActivityChanged', { cafeActivity });
  }

  emitCashoutChanged(...args: any[]) {
    const [user, cashout] = args;
    this.server.emit('cashoutChanged', { user, cashout });
  }

  async emitCategoryChanged(user: any, category: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.MenuCategories);
    await this.redisService.reset(RedisKeys.ActiveMenuCategories);
    this.server.emit('categoryChanged', { user, category });
  }

  emitCheckChanged(...args: any[]) {
    const [user, check] = args;
    this.server.emit('checkChanged', { user, check });
  }

  emitChecklistChanged(...args: any[]) {
    const [user, checklist] = args;
    this.server.emit('checklistChanged', { user, checklist });
  }

  emitCheckoutControlChanged(...args: any[]) {
    const [user, checkoutControl] = args;
    this.server.emit('checkoutControlChanged', { user, checkoutControl });
  }

  emitCollectionChanged(...args: any[]) {
    const [user, collection] = args;
    this.server.emit('collectionChanged', { user, collection });
  }

  emitConsumerChanged(...args: any[]) {
    const [user, consumer] = args;
    this.server.emit('consumerChanged', { user, consumer });
  }

  emitCountChanged(...args: any[]) {
    const [user, count] = args;
    this.server.emit('countChanged', { user, count });
  }

  emitCountListChanged(...args: any[]) {
    const [user, countList] = args;
    this.server.emit('countListChanged', { user, countList });
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

  emitDisabledConditionChanged(...args: any[]) {
    const [user, disabledCondition] = args;
    this.server.emit('disabledConditionChanged', { user, disabledCondition });
  }

  async emitDiscountChanged(user: any, discount: any) {
    await this.redisService.reset(RedisKeys.Discounts);
    this.server.emit('discountChanged', { user, discount });
  }

  emitEducationChanged(...args: any[]) {
    const [user, education] = args;
    this.server.emit('educationChanged', { user, education });
  }

  emitExpenseChanged(...args: any[]) {
    const [user] = args;
    this.server.emit('expenseChanged', { user });
  }

  emitExpenseTypeChanged(...args: any[]) {
    const [user, expenseType] = args;
    this.server.emit('expenseTypeChanged', { user, expenseType });
  }

  emitExpirationCountChanged(...args: any[]) {
    const [user, expirationCount] = args;
    this.server.emit('expirationCountChanged', { user, expirationCount });
  }

  emitExpirationListChanged(...args: any[]) {
    const [user, expirationList] = args;
    this.server.emit('expirationListChanged', { user, expirationList });
  }

  emitFeedbackChanged(...args: any[]) {
    const [feedback] = args;
    this.server.emit('feedbackChanged', { feedback });
  }

  async emitGameChanged(...args: any[]) {
    const [user, game] = args;
    await this.redisService.reset(RedisKeys.GamesMinimal);
    this.server.emit('gameChanged', { user, game });
  }

  emitGameplayChanged(...args: any[]) {
    const [user, gameplay] = args;
    this.server.emit('gameplayChanged', { user, gameplay });
  }

  async emitGameplayCreated(...args: any[]) {
    const [user, gameplay, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('gameplayCreated', { user, gameplay, table });
  }

  emitGameplayUpdated(...args: any[]) {
    const [user, gameplay] = args;
    this.server.emit('gameplayUpdated', { user, gameplay });
  }

  async emitGameplayDeleted(...args: any[]) {
    const [user, gameplay, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('gameplayDeleted', { user, gameplay, table });
  }

  emitIkasProductStockChanged() {
    this.server.emit('ikasProductStockChanged');
  }

  emitIncomeChanged(...args: any[]) {
    const [user, income] = args;
    this.server.emit('incomeChanged', { user, income });
  }

  async emitItemChanged(user?: any, item?: any) {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('itemChanged', { user, item });
  }

  async emitKitchenChanged(...args: any[]) {
    const [user, kitchen] = args;
    await this.redisService.reset(RedisKeys.Kitchens);
    this.server.emit('kitchenChanged', { user, kitchen });
  }

  async emitLocationChanged(...args: any[]) {
    const [location] = args;
    await this.redisService.reset(RedisKeys.Locations);
    await this.redisService.reset(RedisKeys.AllLocations);
    this.server.emit('locationChanged', { location });
  }

  async emitMembershipChanged(...args: any[]) {
    const [user, membership] = args;
    await this.redisService.reset(RedisKeys.Memberships);
    this.server.emit('membershipChanged', { user, membership });
  }

  emitNotificationChanged(...args: any[]) {
    const [notification] = args;
    this.server.emit('notificationChanged', { notification });
  }

  emitNotificationRemoved(...args: any[]) {
    const [notification] = args;
    this.server.emit('notificationRemoved', { notification });
  }

  emitOrderCreated(...args: any[]) {
    const [user, order] = args;
    this.server.emit('orderCreated', { user, order });
  }

  emitOrderGroupChanged() {
    this.server.emit('orderGroupChanged');
  }

  emitOrderNotesChanged(...args: any[]) {
    const [user, orderNotes] = args;
    this.server.emit('orderNotesChanged', { user, orderNotes });
  }

  emitOrderUpdated(...args: any[]) {
    const [user, order] = args;
    this.server.emit('orderUpdated', { user, order });
  }

  async emitPageChanged(...args: any[]) {
    const [user, page] = args;
    await this.redisService.reset(RedisKeys.Pages);
    this.server.emit('pageChanged', { user, page });
  }

  emitPanelSettingsChanged(...args: any[]) {
    const [user, panelSettings] = args;
    this.server.emit('panelSettingsChanged', { user, panelSettings });
  }

  emitPaymentChanged(...args: any[]) {
    const [user, payment] = args;
    this.server.emit('paymentChanged', { user, payment });
  }

  emitPaymentMethodChanged(...args: any[]) {
    const [user, paymentMethod] = args;
    this.server.emit('paymentMethodChanged', { user, paymentMethod });
  }

  emitPointChanged(...args: any[]) {
    const [user, point] = args;
    this.server.emit('pointChanged', { user, point });
  }

  emitPointHistoryChanged(...args: any[]) {
    const [user, pointHistory] = args;
    this.server.emit('pointHistoryChanged', { user, pointHistory });
  }

  emitPopularChanged(...args: any[]) {
    const [user, popular] = args;
    this.server.emit('popularChanged', { user, popular });
  }

  emitProductCategoryChanged(...args: any[]) {
    const [user, productCategory] = args;
    this.server.emit('productCategoryChanged', { user, productCategory });
  }

  async emitProductChanged(user?: any, product?: any) {
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('productChanged', { user, product });
  }

  emitProductStockHistoryChanged(...args: any[]) {
    const [user, productStockHistory] = args;
    this.server.emit('productStockHistoryChanged', {
      user,
      productStockHistory,
    });
  }

  emitReservationChanged(...args: any[]) {
    const [user, reservation] = args;
    this.server.emit('reservationChanged', { user, reservation });
  }

  emitRewardChanged(...args: any[]) {
    const [user, reward] = args;
    this.server.emit('rewardChanged', { user, reward });
  }

  emitServiceChanged(...args: any[]) {
    const [user, service] = args;
    this.server.emit('serviceChanged', { user, service });
  }

  emitShiftChangeRequestChanged(...args: any[]) {
    const [user, shiftChangeRequest] = args;
    this.server.emit('shiftChangeRequestChanged', { user, shiftChangeRequest });
  }

  async emitShiftChanged(...args: any[]) {
    const [user, shift] = args;
    await this.redisService.reset(RedisKeys.Shifts);
    this.server.emit('shiftChanged', { user, shift });
  }

  async emitSingleTableChanged(...args: any[]) {
    const [user, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('singleTableChanged', { user, table });
  }

  async emitStockChanged(user?: any, stock?: any) {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.server.emit('stockChanged', { user, stock });
  }

  async emitTableChanged(...args: any[]) {
    const [user, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('tableChanged', { user, table });
  }
  async emitTableDeleted(...args: any[]) {
    const [user, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('tableDeleted', { user, table });
  }

  async emitTableCreated(...args: any[]) {
    const [user, table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('tableCreated', { user, table });
  }
  async emitTableClosed(...args: any[]) {
    const [table] = args;
    if (table?.location && table?.date) {
      const cacheKey = `${RedisKeys.Tables}:${table.location}:${table.date}`;
      await this.redisService.reset(cacheKey);
    }
    this.server.emit('tableClosed', { table });
  }

  emitTaskTrackChanged(...args: any[]) {
    const [user, taskTrack] = args;
    this.server.emit('taskTrackChanged', { user, taskTrack });
  }

  emitUpperCategoryChanged(...args: any[]) {
    const [user, upperCategory] = args;
    this.server.emit('upperCategoryChanged', { user, upperCategory });
  }

  async emitUserChanged(user: any) {
    await this.redisService.reset(RedisKeys.Users);
    await this.redisService.reset(RedisKeys.MinimalUsers);
    this.server.emit('userChanged', { user });
  }

  emitVendorChanged(...args: any[]) {
    const [user, vendor] = args;
    this.server.emit('vendorChanged', { user, vendor });
  }

  emitVisitChanged(...args: any[]) {
    const [user, visit] = args;
    this.server.emit('visitChanged', { user, visit });
  }
}
