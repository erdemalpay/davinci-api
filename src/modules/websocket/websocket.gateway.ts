import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway as WSGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { extractRefId } from 'src/utils/tsUtils';
import { Stock } from '../accounting/stock.schema';
import { ButtonCallActionEnum } from '../buttonCall/dto/create-buttonCall.dto';
import {
  CONSUMER_APP,
  CONSUMER_ROOM,
  consumerRoom,
  isConsumerTokenPayload,
} from '../consumerApp/consumerToken';
import { ButtonCall } from '../buttonCall/schemas/buttonCall.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Notification } from '../notification/notification.schema';
import { Collection } from '../order/collection.schema';
import { Order } from '../order/order.schema';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';

@WSGateway({ path: '/socket.io' })
export class AppWebSocketGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // The customer app joins the consumers' room, and its consumer's own room
  // when its token is valid. Panel events skip the consumers' room.
  handleConnection(client: Socket) {
    const auth = client.handshake.auth as { app?: string; token?: string };
    if (auth?.app !== CONSUMER_APP) return;
    client.join(CONSUMER_ROOM);
    if (!auth.token) return;
    try {
      const payload = this.jwtService.verify(auth.token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (isConsumerTokenPayload(payload)) {
        client.join(consumerRoom(payload.consumer));
      }
    } catch {
      // An expired token: the app only gets the public events.
    }
  }

  // Everyone but the customer app.
  private toStaff() {
    return this.server.except(CONSUMER_ROOM);
  }

  // A table opened, closed or got a game: the customer app reloads its table.
  private emitTablesChangedToConsumers() {
    this.server.to(CONSUMER_ROOM).emit('myTableChanged');
  }

  private toConsumers(consumerIds: number[]) {
    return this.server.to(consumerIds.map(consumerRoom));
  }

  afterInit() {
    // Disable the default EventEmitter listener limit
    this.server.setMaxListeners(0);
  }
  emitActionChanged() {
    this.toStaff().emit('actionChanged');
  }

  emitActivityChanged() {
    this.toStaff().emit('activityChanged');
  }

  async emitAssetChanged() {
    await this.redisService.reset(RedisKeys.ScreenImages);
    this.toStaff().emit('assetChanged');
  }

  emitAssignmentChanged() {
    this.toStaff().emit('assignmentChanged');
  }

  emitBackInStockChanged() {
    this.toStaff().emit('backInStockChanged');
  }

  async emitAuthorizationChanged() {
    await this.redisService.reset(RedisKeys.Authorizations);
    this.toStaff().emit('authorizationChanged');
  }

  emitMailSubscriptionChanged() {
    this.toStaff().emit('mailSubscriptionChanged');
  }

  emitMailTemplateChanged() {
    this.toStaff().emit('mailTemplateChanged');
  }

  emitMailDraftChanged() {
    this.toStaff().emit('mailDraftChanged');
  }

  emitBrandChanged() {
    this.toStaff().emit('brandChanged');
  }

  emitBreakChanged() {
    this.toStaff().emit('breakChanged');
  }

  emitMiddlemanChanged() {
    this.toStaff().emit('middlemanChanged');
  }

  emitUpstairsDutyChanged() {
    this.toStaff().emit('upstairsDutyChanged');
  }

  emitGameplayTimeChanged() {
    this.toStaff().emit('gameplayTimeChanged');
  }

  async emitBulkProductAndMenuItemChanged() {
    await this.redisService.reset(RedisKeys.AccountingAllProducts);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    await this.redisService.reset(RedisKeys.MenuItems);
    this.toStaff().emit('bulkProductAndMenuItemChanged');
  }

  emitButtonCallChanged(
    buttonCall?: ButtonCall,
    action?: ButtonCallActionEnum,
  ) {
    this.toStaff().emit('buttonCallChanged', {
      location: buttonCall?.location,
      type: buttonCall?.type,
      action,
      tableName: buttonCall?.tableName,
      assignedTo: buttonCall?.assignedTo,
    });
    this.server.to(CONSUMER_ROOM).emit('buttonCallChanged');
  }

  emitCafeActivityChanged() {
    this.toStaff().emit('cafeActivityChanged');
  }

  emitCashoutChanged() {
    this.toStaff().emit('cashoutChanged');
  }

  async emitCategoryChanged() {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.MenuCategories);
    await this.redisService.reset(RedisKeys.ActiveMenuCategories);
    this.server.emit('categoryChanged');
  }

  emitCheckChanged() {
    this.toStaff().emit('checkChanged');
  }

  emitChecklistChanged() {
    this.toStaff().emit('checklistChanged');
  }

  emitCheckoutControlChanged() {
    this.toStaff().emit('checkoutControlChanged');
  }

  emitCollectionChanged(collection: Collection) {
    this.toStaff().emit('collectionChanged', { collection });
  }

  emitConsumerChanged() {
    this.toStaff().emit('consumerChanged');
  }

  emitCountChanged() {
    this.toStaff().emit('countChanged');
  }

  emitCountListChanged() {
    this.toStaff().emit('countListChanged');
  }

  // Carries the created orders so that panels add them to what they have
  // instead of everyone reloading the day's orders.
  emitCreateMultipleOrder(
    user: User,
    table: Table,
    locationId: number,
    kitchenIds: string[],
    orders: Order[] = [],
  ) {
    this.toStaff().emit('createMultipleOrder', {
      user,
      table,
      locationId,
      kitchenIds,
      orders,
    });
  }

  emitDisabledConditionChanged() {
    this.toStaff().emit('disabledConditionChanged');
  }

  async emitDiscountChanged() {
    await this.redisService.reset(RedisKeys.Discounts);
    this.toStaff().emit('discountChanged');
  }

  emitEducationChanged() {
    this.toStaff().emit('educationChanged');
  }

  emitExpenseChanged() {
    this.toStaff().emit('expenseChanged');
  }

  emitExpenseTypeChanged() {
    this.toStaff().emit('expenseTypeChanged');
  }

  emitExpirationCountChanged() {
    this.toStaff().emit('expirationCountChanged');
  }

  emitExpirationListChanged() {
    this.toStaff().emit('expirationListChanged');
  }

  emitFeedbackChanged() {
    this.toStaff().emit('feedbackChanged');
  }

  async emitGameChanged() {
    await this.redisService.reset(RedisKeys.GamesMinimal);
    this.server.emit('gameChanged');
  }

  async emitGameplayChanged() {
    await this.redisService.reset(RedisKeys.Tables);
    this.server.emit('gameplayChanged');
  }

  async emitGameplayCreated(gameplay: Gameplay, tableId: Table['id']) {
    await this.redisService.reset(RedisKeys.Tables);

    this.toStaff().emit('gameplayCreated', { gameplay, tableId });
    this.emitTablesChangedToConsumers();
  }

  async emitGameplayUpdated(gameplay: Gameplay) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('gameplayUpdated', { gameplay });
    this.emitTablesChangedToConsumers();
  }

  async emitGameplayDeleted(gameplay: Gameplay, tableId: Table['id']) {
    await this.redisService.reset(RedisKeys.Tables);

    this.toStaff().emit('gameplayDeleted', { gameplay, tableId });
    this.emitTablesChangedToConsumers();
  }

  emitIkasProductStockChanged() {
    this.toStaff().emit('ikasProductStockChanged');
  }

  emitShopifyProductStockChanged() {
    this.toStaff().emit('shopifyProductStockChanged');
  }

  emitIncomeChanged() {
    this.toStaff().emit('incomeChanged');
  }

  emitInventoryChanged() {
    this.toStaff().emit('inventoryChanged');
  }

  emitStaffLeaveChanged() {
    this.toStaff().emit('staffLeaveChanged');
  }

  async emitItemChanged() {
    await this.redisService.reset(RedisKeys.MenuItems);
    await this.redisService.reset(RedisKeys.AccountingAllProducts);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.server.emit('itemChanged');
  }

  emitCustomerPopupChanged() {
    this.toStaff().emit('customerPopupChanged');
  }

  async emitKitchenChanged() {
    await this.redisService.reset(RedisKeys.Kitchens);
    this.toStaff().emit('kitchenChanged');
  }

  async emitLocationChanged() {
    await this.redisService.reset(RedisKeys.Locations);
    await this.redisService.reset(RedisKeys.AllLocations);
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('locationChanged');
  }

  async emitMembershipChanged() {
    await this.redisService.reset(RedisKeys.Memberships);
    this.toStaff().emit('membershipChanged');
  }

  emitNotificationChanged(notifications: Notification[]) {
    this.toStaff().emit('notificationChanged', { notifications });
  }

  emitNotificationRemoved(notification: Notification) {
    this.toStaff().emit('notificationRemoved', { notification });
  }

  async emitOrderCreated(order: Order) {
    await this.redisService.reset(RedisKeys.Tables);
    const normalizedOrder = {
      ...order.toObject(),
      item: extractRefId(order.item),
      kitchen: extractRefId(order.kitchen),
    };
    this.toStaff().emit('orderCreated', { order: normalizedOrder });
  }

  emitOrderGroupChanged() {
    this.toStaff().emit('orderGroupChanged');
  }

  emitOrderNotesChanged() {
    this.toStaff().emit('orderNotesChanged');
  }

  async emitOrderUpdated(orders: Order[]) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('orderUpdated', { orders });
  }

  async emitOrderDeleted(order: Order) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('orderDeleted', { order });
  }

  async emitTodayOrderChanged() {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('todayOrderChanged');
  }

  async emitPageChanged() {
    await this.redisService.reset(RedisKeys.Pages);
    this.toStaff().emit('pageChanged');
  }

  emitPanelSettingsChanged() {
    this.toStaff().emit('panelSettingsChanged');
  }

  emitPaymentChanged() {
    this.toStaff().emit('paymentChanged');
  }

  emitPaymentMethodChanged() {
    this.toStaff().emit('paymentMethodChanged');
  }

  emitPointChanged() {
    this.toStaff().emit('pointChanged');
  }

  emitPointHistoryChanged() {
    this.toStaff().emit('pointHistoryChanged');
  }

  emitPopularChanged() {
    this.server.emit('popularChanged');
  }

  emitProductCategoryChanged() {
    this.toStaff().emit('productCategoryChanged');
  }

  async emitProductChanged() {
    await this.redisService.reset(RedisKeys.AccountingAllProducts);
    await this.redisService.reset(RedisKeys.AccountingProducts);
    this.toStaff().emit('productChanged');
  }

  emitProductStockHistoryChanged() {
    this.toStaff().emit('productStockHistoryChanged');
  }

  emitReservationChanged() {
    this.toStaff().emit('reservationChanged');
  }

  emitRewardChanged() {
    this.toStaff().emit('rewardChanged');
  }

  emitTournamentChanged() {
    this.toStaff().emit('tournamentChanged');
  }

  emitRetailerChanged() {
    this.toStaff().emit('retailerChanged');
  }

  emitServiceChanged() {
    this.toStaff().emit('serviceChanged');
  }

  emitShiftChangeRequestChanged() {
    this.toStaff().emit('shiftChangeRequestChanged');
  }

  async emitShiftChanged() {
    await this.redisService.reset(RedisKeys.Shifts);
    this.toStaff().emit('shiftChanged');
  }

  async emitSingleTableChanged(table: Partial<Table>) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('singleTableChanged', { table });
  }

  async emitStockChanged() {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.toStaff().emit('stockChanged');
  }
  async emitStockAdded(stock: Stock) {
    await this.redisService.reset(RedisKeys.AccountingStocks);
    this.toStaff().emit('stockAdded', { stock });
  }

  async emitTableChanged(table: Table) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('tableChanged', { table });
    this.emitTablesChangedToConsumers();
  }
  async emitTableDeleted(table: Table) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('tableDeleted', { table });
    this.emitTablesChangedToConsumers();
  }

  async emitTableCreated(table: Table) {
    await this.redisService.reset(RedisKeys.Tables);

    this.toStaff().emit('tableCreated', { table });
  }
  async emitTableClosed(table: Table) {
    await this.redisService.reset(RedisKeys.Tables);
    this.toStaff().emit('tableClosed', { table });
    this.emitTablesChangedToConsumers();
  }

  emitTaskTrackChanged() {
    this.toStaff().emit('taskTrackChanged');
  }

  emitReleaseNoteChanged() {
    this.toStaff().emit('releaseNoteChanged');
  }

  emitUpperCategoryChanged() {
    this.toStaff().emit('upperCategoryChanged');
  }

  async emitUserChanged() {
    await this.redisService.reset(RedisKeys.Users);
    await this.redisService.reset(RedisKeys.MinimalUsers);
    this.toStaff().emit('userChanged');
  }

  emitVendorChanged() {
    this.toStaff().emit('vendorChanged');
  }

  emitVisitChanged() {
    this.toStaff().emit('visitChanged');
  }

  emitQrCodeChanged() {
    this.toStaff().emit('qrCodeChanged');
  }

  emitConsumerTableChanged(consumerIds: number[]) {
    if (consumerIds.length)
      this.toConsumers(consumerIds).emit('myTableChanged');
  }

  emitGameplayResultChanged(consumerIds: number[]) {
    if (consumerIds.length) {
      this.toConsumers(consumerIds).emit('gameplayResultChanged');
    }
  }
}
