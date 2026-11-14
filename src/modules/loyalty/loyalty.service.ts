import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { ClientSession, Connection, Model } from 'mongoose';
import { withSession } from 'src/utils/withSession';
import { ShopifyService } from '../shopify/shopify.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  AdjustLoyaltyPointsDto,
  LoyaltyAccountFilter,
  LoyaltyCouponFilter,
  LoyaltyTransactionFilter,
  UpdateLoyaltySettingsDto,
} from './loyalty.dto';
import {
  SHOPIFY_ORDER_CREATED,
  SHOPIFY_ORDER_FULFILLED,
  SHOPIFY_ORDER_REFUNDED_OR_CANCELLED,
  ShopifyWebhookEvent,
} from './loyalty.events';
import {
  LoyaltyAccount,
  LoyaltyCoupon,
  LoyaltyCouponStatus,
  LoyaltySettings,
  LoyaltyTransaction,
  LoyaltyTransactionType,
  LOYALTY_SETTINGS_ID,
} from './loyalty.schema';

const SHOPIFY_CREATED_BY = 'shopify';
const CUSTOMER_CREATED_BY = 'customer';
const COUPON_CODE_PREFIX = 'PUAN-';
// No 0/O or 1/I so a code read out loud can't be mistyped.
const COUPON_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

type TransactionFields = Partial<
  Pick<
    LoyaltyTransaction,
    | 'shopifyOrderId'
    | 'shopifyOrderName'
    | 'orderAmount'
    | 'rate'
    | 'couponCode'
    | 'note'
    | 'createdBy'
  >
>;

export const customerIdFromGid = (value: any): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const id = String(value).split('/').pop();
  return id && /^\d+$/.test(id) ? id : null;
};

const toAmount = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Points are whole TL: always rounded down.
export const pointsFor = (amount: number, rate: number): number =>
  Math.max(0, Math.floor((amount * rate) / 100 + 1e-9));

const isDuplicateKeyError = (error: any) => error?.code === 11000;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectModel(LoyaltyAccount.name)
    private readonly accountModel: Model<LoyaltyAccount>,
    @InjectModel(LoyaltyTransaction.name)
    private readonly transactionModel: Model<LoyaltyTransaction>,
    @InjectModel(LoyaltyCoupon.name)
    private readonly couponModel: Model<LoyaltyCoupon>,
    @InjectModel(LoyaltySettings.name)
    private readonly settingsModel: Model<LoyaltySettings>,
    @InjectConnection() private readonly conn: Connection,
    private readonly shopifyService: ShopifyService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  // ---------------------------------------------------------------- settings

  async getSettings(): Promise<LoyaltySettings> {
    const existing = await this.settingsModel.findById(LOYALTY_SETTINGS_ID);
    if (existing) return existing;
    try {
      return await this.settingsModel.create({ _id: LOYALTY_SETTINGS_ID });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return this.settingsModel.findById(LOYALTY_SETTINGS_ID);
      }
      throw error;
    }
  }

  async updateSettings(user: User, dto: UpdateLoyaltySettingsDto) {
    const updates: Partial<LoyaltySettings> = {};
    if (dto.isActive !== undefined) updates.isActive = Boolean(dto.isActive);
    if (dto.earnRate !== undefined) {
      const rate = Number(dto.earnRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new HttpException(
          'Puan oranı 0 ile 100 arasında olmalı',
          HttpStatus.BAD_REQUEST,
        );
      }
      updates.earnRate = rate;
    }
    if (dto.couponValidityDays !== undefined) {
      const days = Number(dto.couponValidityDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new HttpException(
          'Kupon süresi 1 ile 365 gün arasında olmalı',
          HttpStatus.BAD_REQUEST,
        );
      }
      updates.couponValidityDays = days;
    }
    if (dto.minRedeemPoints !== undefined) {
      const min = Number(dto.minRedeemPoints);
      if (!Number.isInteger(min) || min < 1) {
        throw new HttpException(
          'En az kullanım 1 puan veya daha fazla olmalı',
          HttpStatus.BAD_REQUEST,
        );
      }
      updates.minRedeemPoints = min;
    }

    await this.getSettings();
    const settings = await this.settingsModel.findByIdAndUpdate(
      LOYALTY_SETTINGS_ID,
      { $set: { ...updates, updatedBy: user?._id, updatedAt: new Date() } },
      { new: true },
    );
    this.websocketGateway.emitLoyaltyChanged();
    return settings;
  }

  // ---------------------------------------------------------------- accounts

  private async getOrCreateAccount(
    shopifyCustomerId: string,
    email?: string,
    name?: string,
  ): Promise<LoyaltyAccount> {
    const existing = await this.accountModel.findOne({ shopifyCustomerId });
    if (existing) {
      const updates: Record<string, string> = {};
      if (email && existing.email !== email) updates.email = email;
      if (name && existing.name !== name) updates.name = name;
      if (Object.keys(updates).length > 0) {
        await this.accountModel.updateOne(
          { _id: existing._id },
          { $set: updates },
        );
      }
      return existing;
    }
    try {
      return await new this.accountModel({
        shopifyCustomerId,
        email,
        name,
        balance: 0,
        totalEarned: 0,
        totalRedeemed: 0,
      }).save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return this.accountModel.findOne({ shopifyCustomerId });
      }
      throw error;
    }
  }

  /**
   * Changes the balance and writes the matching transaction. With
   * `requireBalance` the update only matches while the account has enough
   * points, so two requests can never spend the same points.
   */
  private async applyChange(
    account: LoyaltyAccount,
    type: LoyaltyTransactionType,
    change: number,
    fields: TransactionFields,
    options: { session?: ClientSession; requireBalance?: boolean } = {},
  ): Promise<{ account: LoyaltyAccount; transaction: LoyaltyTransaction }> {
    const { session, requireBalance } = options;
    const inc: Record<string, number> = { balance: change };
    if (type === LoyaltyTransactionType.EARN) inc.totalEarned = change;
    if (type === LoyaltyTransactionType.EARN_REVERSAL) inc.totalEarned = change;
    if (type === LoyaltyTransactionType.REDEEM) inc.totalRedeemed = -change;
    if (type === LoyaltyTransactionType.COUPON_RETURN)
      inc.totalRedeemed = -change;

    const updated = await this.accountModel.findOneAndUpdate(
      {
        _id: account._id,
        ...(requireBalance && change < 0 ? { balance: { $gte: -change } } : {}),
      },
      { $inc: inc, $set: { updatedAt: new Date() } },
      withSession({ new: true }, session),
    );
    if (!updated) {
      throw new HttpException('Yetersiz puan', HttpStatus.BAD_REQUEST);
    }

    const transaction = await new this.transactionModel({
      account: account._id,
      shopifyCustomerId: account.shopifyCustomerId,
      type,
      change,
      balanceAfter: updated.balance,
      createdAt: new Date(),
      ...fields,
    }).save(withSession({}, session));

    return { account: updated, transaction };
  }

  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.conn.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  // ------------------------------------------------------- Shopify webhooks

  @OnEvent(SHOPIFY_ORDER_FULFILLED)
  async handleOrderFulfilled({ data }: ShopifyWebhookEvent) {
    try {
      await this.earnForOrder(data);
    } catch (error) {
      this.logger.error(
        `Could not credit loyalty points for order ${data?.id}`,
        error?.stack ?? error,
      );
    }
  }

  @OnEvent(SHOPIFY_ORDER_REFUNDED_OR_CANCELLED)
  async handleOrderRefundedOrCancelled({ data }: ShopifyWebhookEvent) {
    const orderId = String(data?.order_id ?? data?.id ?? '');
    try {
      if (orderId) await this.reconcileOrder(orderId);
    } catch (error) {
      this.logger.error(
        `Could not take back loyalty points for order ${orderId}`,
        error?.stack ?? error,
      );
    }
  }

  @OnEvent(SHOPIFY_ORDER_CREATED)
  async handleOrderCreated({ data }: ShopifyWebhookEvent) {
    try {
      await this.markCouponsUsed(data);
    } catch (error) {
      this.logger.error(
        `Could not mark loyalty coupons used for order ${data?.id}`,
        error?.stack ?? error,
      );
    }
  }

  /** Points for a fulfilled order: rate % of the order after discounts and refunds, without shipping. */
  async earnForOrder(order: any) {
    const settings = await this.getSettings();
    if (!settings.isActive) return null;

    const shopifyCustomerId = customerIdFromGid(order?.customer?.id);
    if (!shopifyCustomerId || order?.test || order?.cancelled_at) return null;
    // Shopify POS sales are cafe sales; the online program is separate.
    if (order?.source_name === 'pos') return null;

    const orderAmount = toAmount(
      order?.current_subtotal_price ?? order?.subtotal_price,
    );
    const points = pointsFor(orderAmount, settings.earnRate);
    if (points <= 0) return null;

    const name = [order?.customer?.first_name, order?.customer?.last_name]
      .filter(Boolean)
      .join(' ');
    const account = await this.getOrCreateAccount(
      shopifyCustomerId,
      order?.customer?.email ?? order?.email,
      name || undefined,
    );

    try {
      const result = await this.inTransaction((session) =>
        this.applyChange(
          account,
          LoyaltyTransactionType.EARN,
          points,
          {
            shopifyOrderId: String(order.id),
            shopifyOrderName: order?.name,
            orderAmount,
            rate: settings.earnRate,
            createdBy: SHOPIFY_CREATED_BY,
          },
          { session },
        ),
      );
      this.websocketGateway.emitLoyaltyChanged();
      return result.transaction;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        this.logger.log(`Order ${order.id} already earned loyalty points`);
        return null;
      }
      throw error;
    }
  }

  /**
   * After a refund or cancellation: brings the order's earned points down to
   * what its remaining amount is worth (0 when cancelled), and gives back the
   * points of a loyalty coupon used on a cancelled order.
   */
  async reconcileOrder(shopifyOrderId: string) {
    const earn = await this.transactionModel.findOne({
      shopifyOrderId,
      type: LoyaltyTransactionType.EARN,
    });
    const usedCoupon = await this.couponModel.findOne({
      usedOrderId: shopifyOrderId,
      status: LoyaltyCouponStatus.USED,
    });
    if (!earn && !usedCoupon) return;

    const data = await this.shopifyService.adminGraphQL<any>(
      `query LoyaltyOrder($id: ID!) {
        order(id: $id) {
          name
          cancelledAt
          currentSubtotalPriceSet { shopMoney { amount } }
        }
      }`,
      { id: `gid://shopify/Order/${shopifyOrderId}` },
    );
    const order = data?.order;
    if (!order) return;
    const cancelled = Boolean(order.cancelledAt);

    if (earn) {
      const target = cancelled
        ? 0
        : pointsFor(
            toAmount(order.currentSubtotalPriceSet?.shopMoney?.amount),
            earn.rate ?? 0,
          );
      await this.inTransaction(async (session) => {
        const reversals = await this.transactionModel.find(
          { shopifyOrderId, type: LoyaltyTransactionType.EARN_REVERSAL },
          null,
          withSession({}, session),
        );
        const net =
          earn.change + reversals.reduce((sum, t) => sum + t.change, 0);
        const takeBack = net - target;
        if (takeBack <= 0) return;
        const account = await this.accountModel.findById(
          earn.account,
          null,
          withSession({}, session),
        );
        // Points already spent can push the balance below zero; the customer
        // can't create a coupon until it's positive again.
        await this.applyChange(
          account,
          LoyaltyTransactionType.EARN_REVERSAL,
          -takeBack,
          {
            shopifyOrderId,
            shopifyOrderName: order.name,
            note: cancelled ? 'Sipariş iptal edildi' : 'Sipariş iadesi',
            createdBy: SHOPIFY_CREATED_BY,
          },
          { session },
        );
      });
    }

    if (usedCoupon && cancelled) {
      try {
        await this.inTransaction(async (session) => {
          const coupon = await this.couponModel.findOneAndUpdate(
            { _id: usedCoupon._id, status: LoyaltyCouponStatus.USED },
            { $set: { status: LoyaltyCouponStatus.RETURNED } },
            withSession({ new: true }, session),
          );
          if (!coupon) return;
          const account = await this.accountModel.findById(
            coupon.account,
            null,
            withSession({}, session),
          );
          await this.applyChange(
            account,
            LoyaltyTransactionType.COUPON_RETURN,
            coupon.value,
            {
              shopifyOrderId,
              shopifyOrderName: order.name,
              couponCode: coupon.code,
              note: 'Kuponun kullanıldığı sipariş iptal edildi',
              createdBy: SHOPIFY_CREATED_BY,
            },
            { session },
          );
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    }

    this.websocketGateway.emitLoyaltyChanged();
  }

  async markCouponsUsed(order: any) {
    const codes: string[] = (order?.discount_codes ?? [])
      .map((d: any) =>
        String(d?.code ?? '')
          .trim()
          .toUpperCase(),
      )
      .filter((code: string) => code.startsWith(COUPON_CODE_PREFIX));
    if (codes.length === 0) return;

    const result = await this.couponModel.updateMany(
      { code: { $in: codes }, status: LoyaltyCouponStatus.ACTIVE },
      {
        $set: {
          status: LoyaltyCouponStatus.USED,
          usedOrderId: String(order.id),
          usedOrderName: order?.name,
          usedAt: new Date(),
        },
      },
    );
    if (result.modifiedCount > 0) this.websocketGateway.emitLoyaltyChanged();
  }

  async expireCoupons(now = new Date()) {
    const result = await this.couponModel.updateMany(
      { status: LoyaltyCouponStatus.ACTIVE, expiresAt: { $lt: now } },
      { $set: { status: LoyaltyCouponStatus.EXPIRED } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`${result.modifiedCount} loyalty coupons expired`);
      this.websocketGateway.emitLoyaltyChanged();
    }
    return result.modifiedCount;
  }

  // ------------------------------------------------- customer (app proxy)

  async getCustomerOverview(shopifyCustomerId: string) {
    const settings = await this.getSettings();
    const account = await this.accountModel.findOne({ shopifyCustomerId });
    const [transactions, coupons] = account
      ? await Promise.all([
          this.transactionModel
            .find({ account: account._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
          this.couponModel
            .find({ account: account._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        ])
      : [[], []];

    return {
      program: {
        isActive: settings.isActive,
        earnRate: settings.earnRate,
        couponValidityDays: settings.couponValidityDays,
        minRedeemPoints: settings.minRedeemPoints,
      },
      balance: account?.balance ?? 0,
      totalEarned: account?.totalEarned ?? 0,
      totalRedeemed: account?.totalRedeemed ?? 0,
      transactions: transactions.map((t) => ({
        type: t.type,
        change: t.change,
        balanceAfter: t.balanceAfter,
        orderName: t.shopifyOrderName,
        couponCode: t.couponCode,
        note: t.type === LoyaltyTransactionType.MANUAL ? t.note : undefined,
        createdAt: t.createdAt,
      })),
      coupons: coupons.map((c) => ({
        code: c.code,
        value: c.value,
        status: c.status,
        expiresAt: c.expiresAt,
        usedAt: c.usedAt,
        createdAt: c.createdAt,
      })),
    };
  }

  private generateCouponCode() {
    let code = COUPON_CODE_PREFIX;
    for (let i = 0; i < 8; i++) {
      code += COUPON_CODE_ALPHABET[randomInt(COUPON_CODE_ALPHABET.length)];
    }
    return code;
  }

  private async deleteShopifyDiscount(id: string, code: string) {
    try {
      await this.shopifyService.adminGraphQL(
        `mutation LoyaltyCouponDelete($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors { field message }
          }
        }`,
        { id },
        'discountCodeDelete.userErrors',
      );
    } catch (error) {
      this.logger.error(
        `Could not delete Shopify discount ${code} (${id}), delete it by hand`,
        error?.stack ?? error,
      );
    }
  }

  /** Turns points into a single-use fixed amount coupon only this customer can use. */
  async redeem(shopifyCustomerId: string, rawAmount: any) {
    const settings = await this.getSettings();
    if (!settings.isActive) {
      throw new HttpException(
        'Puan programı şu anda kapalı',
        HttpStatus.BAD_REQUEST,
      );
    }
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < settings.minRedeemPoints) {
      throw new HttpException(
        `En az ${settings.minRedeemPoints} puan kullanılabilir`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const account = await this.accountModel.findOne({ shopifyCustomerId });
    if (!account || account.balance < amount) {
      throw new HttpException('Yetersiz puan', HttpStatus.BAD_REQUEST);
    }

    // Take the points first (atomically), give them back if Shopify fails.
    const reserved = await this.accountModel.findOneAndUpdate(
      { _id: account._id, balance: { $gte: amount } },
      { $inc: { balance: -amount }, $set: { updatedAt: new Date() } },
      { new: true },
    );
    if (!reserved) {
      throw new HttpException('Yetersiz puan', HttpStatus.BAD_REQUEST);
    }

    const code = this.generateCouponCode();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + settings.couponValidityDays * DAY_MS,
    );
    let shopifyDiscountId: string;
    try {
      const data = await this.shopifyService.adminGraphQL<any>(
        `mutation LoyaltyCoupon($input: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $input) {
            codeDiscountNode { id }
            userErrors { field message }
          }
        }`,
        {
          input: {
            title: `Puan kuponu ${code} (${amount} TL)`,
            code,
            startsAt: now.toISOString(),
            endsAt: expiresAt.toISOString(),
            context: {
              customers: {
                add: [`gid://shopify/Customer/${shopifyCustomerId}`],
              },
            },
            customerGets: {
              value: {
                discountAmount: {
                  amount: amount.toFixed(2),
                  appliesOnEachItem: false,
                },
              },
              items: { all: true },
            },
            combinesWith: {
              orderDiscounts: false,
              productDiscounts: false,
              shippingDiscounts: false,
            },
            usageLimit: 1,
            appliesOncePerCustomer: true,
          },
        },
        'discountCodeBasicCreate.userErrors',
      );
      shopifyDiscountId = data.discountCodeBasicCreate.codeDiscountNode.id;
    } catch (error) {
      await this.accountModel.updateOne(
        { _id: account._id },
        { $inc: { balance: amount } },
      );
      this.logger.error(
        `Could not create loyalty coupon for customer ${shopifyCustomerId}`,
        error?.stack ?? error,
      );
      throw new HttpException(
        'Kupon oluşturulamadı, lütfen tekrar deneyin',
        HttpStatus.BAD_GATEWAY,
      );
    }

    let coupon: LoyaltyCoupon;
    try {
      coupon = await this.inTransaction(async (session) => {
        const saved = await new this.couponModel({
          account: account._id,
          shopifyCustomerId,
          code,
          value: amount,
          status: LoyaltyCouponStatus.ACTIVE,
          shopifyDiscountId,
          expiresAt,
          createdAt: now,
        }).save(withSession({}, session));
        await this.accountModel.updateOne(
          { _id: account._id },
          { $inc: { totalRedeemed: amount } },
          withSession({}, session),
        );
        await new this.transactionModel({
          account: account._id,
          shopifyCustomerId,
          type: LoyaltyTransactionType.REDEEM,
          change: -amount,
          balanceAfter: reserved.balance,
          couponCode: code,
          createdBy: CUSTOMER_CREATED_BY,
          createdAt: now,
        }).save(withSession({}, session));
        return saved;
      });
    } catch (error) {
      // The coupon exists in Shopify but not here: remove it and give the
      // points back so the customer can't end up with both.
      this.logger.error(
        `Could not save loyalty coupon ${code}, removing it from Shopify`,
        error?.stack ?? error,
      );
      await this.deleteShopifyDiscount(shopifyDiscountId, code);
      await this.accountModel.updateOne(
        { _id: account._id },
        { $inc: { balance: amount } },
      );
      throw new HttpException(
        'Kupon oluşturulamadı, lütfen tekrar deneyin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.websocketGateway.emitLoyaltyChanged();
    return {
      code: coupon.code,
      value: coupon.value,
      expiresAt: coupon.expiresAt,
      balance: reserved.balance,
    };
  }

  // ------------------------------------------------------------------ panel

  async adjustPoints(
    user: User,
    shopifyCustomerId: string,
    dto: AdjustLoyaltyPointsDto,
  ) {
    const change = Number(dto.change);
    if (!Number.isInteger(change) || change === 0) {
      throw new HttpException(
        'Puan değişikliği sıfırdan farklı bir tam sayı olmalı',
        HttpStatus.BAD_REQUEST,
      );
    }
    const note = String(dto.note ?? '').trim();
    if (!note) {
      throw new HttpException('Açıklama gerekli', HttpStatus.BAD_REQUEST);
    }

    let account = await this.accountModel.findOne({ shopifyCustomerId });
    if (!account) {
      const customer = await this.shopifyService.getCustomerById(
        shopifyCustomerId,
      );
      if (!customer) {
        throw new HttpException('Müşteri bulunamadı', HttpStatus.NOT_FOUND);
      }
      account = await this.getOrCreateAccount(
        shopifyCustomerId,
        customer.defaultEmailAddress?.emailAddress,
        [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
          undefined,
      );
    }

    const result = await this.inTransaction((session) =>
      this.applyChange(
        account,
        LoyaltyTransactionType.MANUAL,
        change,
        { note, createdBy: user?._id },
        { session, requireBalance: true },
      ),
    );
    this.websocketGateway.emitLoyaltyChanged();
    return result;
  }

  async findAccounts(filter: LoyaltyAccountFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filter.limit) || 50));
    const query: Record<string, any> = {};
    const search = filter.search?.trim();
    if (search) {
      const regex = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
        'i',
      );
      query.$or = [
        { name: regex },
        { email: regex },
        { shopifyCustomerId: search },
      ];
    }
    const [data, totalNumber] = await Promise.all([
      this.accountModel
        .find(query)
        .sort({ balance: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.accountModel.countDocuments(query),
    ]);
    return {
      data,
      totalNumber,
      totalPages: Math.ceil(totalNumber / limit),
      page,
      limit,
    };
  }

  async findAccountDetail(shopifyCustomerId: string) {
    const account = await this.accountModel
      .findOne({ shopifyCustomerId })
      .lean();
    if (!account) {
      return { account: null, transactions: [], coupons: [] };
    }
    const [transactions, coupons] = await Promise.all([
      this.transactionModel
        .find({ account: account._id })
        .sort({ createdAt: -1 })
        .lean(),
      this.couponModel
        .find({ account: account._id })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    return { account, transactions, coupons };
  }

  async findTransactions(filter: LoyaltyTransactionFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filter.limit) || 50));
    const query: Record<string, any> = {};
    if (filter.type) query.type = filter.type;
    if (filter.shopifyCustomerId)
      query.shopifyCustomerId = filter.shopifyCustomerId;
    if (filter.after || filter.before) {
      query.createdAt = {};
      if (filter.after) query.createdAt.$gte = new Date(filter.after);
      if (filter.before) query.createdAt.$lte = new Date(filter.before);
    }
    const [data, totalNumber] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('account', 'name email shopifyCustomerId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);
    return {
      data,
      totalNumber,
      totalPages: Math.ceil(totalNumber / limit),
      page,
      limit,
    };
  }

  async findCoupons(filter: LoyaltyCouponFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filter.limit) || 50));
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    const [data, totalNumber] = await Promise.all([
      this.couponModel
        .find(query)
        .populate('account', 'name email shopifyCustomerId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.couponModel.countDocuments(query),
    ]);
    return {
      data,
      totalNumber,
      totalPages: Math.ceil(totalNumber / limit),
      page,
      limit,
    };
  }

  /** Program totals for the panel. Outstanding points are the program's TL liability. */
  async getSummary() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [accounts, coupons, thisMonth] = await Promise.all([
      this.accountModel.aggregate([
        {
          $group: {
            _id: null,
            accountCount: { $sum: 1 },
            outstandingPoints: { $sum: { $max: ['$balance', 0] } },
            totalEarned: { $sum: '$totalEarned' },
            totalRedeemed: { $sum: '$totalRedeemed' },
          },
        },
      ]),
      this.couponModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            value: { $sum: '$value' },
          },
        },
      ]),
      this.transactionModel.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        {
          $group: {
            _id: '$type',
            points: { $sum: '$change' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totals = accounts[0] ?? {
      accountCount: 0,
      outstandingPoints: 0,
      totalEarned: 0,
      totalRedeemed: 0,
    };
    delete totals._id;
    return {
      ...totals,
      coupons: Object.fromEntries(
        coupons.map((c) => [c._id, { count: c.count, value: c.value }]),
      ),
      thisMonth: Object.fromEntries(
        thisMonth.map((t) => [t._id, { points: t.points, count: t.count }]),
      ),
    };
  }
}
