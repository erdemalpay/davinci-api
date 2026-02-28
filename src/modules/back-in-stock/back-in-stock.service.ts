import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailType } from '../mail/mail.schema';
import { MailService } from '../mail/mail.service';
import { MenuService } from '../menu/menu.service';
import { ShopifyService } from '../shopify/shopify.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  BackInStockQueryDto,
  CreateBackInStockSubscriptionDto,
  UpdateSubscriptionStatusDto,
} from './back-in-stock.dto';
import {
  BackInStockSubscription,
  SubscriptionStatus,
} from './back-in-stock.schema';

@Injectable()
export class BackInStockService {
  private readonly logger = new Logger(BackInStockService.name);

  constructor(
    @InjectModel(BackInStockSubscription.name)
    private backInStockModel: Model<BackInStockSubscription>,
    private readonly shopifyService: ShopifyService,
    private readonly menuService: MenuService,
    private readonly mailService: MailService,
    private readonly webSocketGateway: AppWebSocketGateway,
  ) {}

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  }

  async createSubscription(
    dto: CreateBackInStockSubscriptionDto,
  ): Promise<BackInStockSubscription> {
    try {
      // Check if subscription already exists
      const existing = await this.backInStockModel.findOne({
        email: dto.email,
        variantId: dto.variantId,
        status: SubscriptionStatus.ACTIVE,
      });

      if (existing) {
        this.logger.log(
          `Subscription already exists for ${dto.email} - variant ${dto.variantId}`,
        );
        return existing;
      }

      // Try to get menu item ID from MenuItem through Shopify variant ID
      let menuItemId = null;

      try {
        // Find the MenuItem by Shopify variant ID
        const menuItem = await this.menuService.findByShopifyVariantId(
          dto.variantId,
        );

        if (menuItem) {
          menuItemId = menuItem._id;
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch menu item for variant ${dto.variantId}: ${
            (error as Error).message
          }`,
        );
      }

      const subscription = new this.backInStockModel({
        ...dto,
        subscribedAt: new Date(dto.subscribedAt),
        status: SubscriptionStatus.ACTIVE,
        menuItemId,
      });

      const saved = await subscription.save();
      this.logger.log(
        `Created back-in-stock subscription ${saved._id} for ${dto.email}`,
      );

      this.webSocketGateway.emitBackInStockChanged();

      // Also subscribe to mail list for back-in-stock notifications
      try {
        await this.mailService.subscribe({
          email: dto.email,
          subscribedTypes: [MailType.BACK_IN_STOCK],
          locale: 'tr',
        });
        this.logger.log(
          `Subscribed ${dto.email} to mail list for back-in-stock notifications`,
        );
      } catch (mailError) {
        this.logger.warn(
          `Failed to subscribe ${dto.email} to mail list: ${
            (mailError as Error).message
          }`,
        );
      }

      return saved;
    } catch (error) {
      this.logger.error(
        `Error creating subscription: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async getSubscriptions(query: BackInStockQueryDto) {
    const {
      page = 1,
      limit = 10,
      email,
      shop,
      productId,
      variantId,
      status,
      after,
      before,
      sort = 'createdAt',
      asc = -1,
    } = query;

    const filter: Record<string, any> = {};

    if (email) filter.email = email;
    if (shop) filter.shop = shop;
    if (productId) filter.productId = productId;
    if (variantId) filter.variantId = variantId;
    if (status) filter.status = status;

    if (after || before) {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length > 0) {
        filter.createdAt = rangeFilter;
      }
    }

    const total = await this.backInStockModel.countDocuments(filter);
    const skip = (page - 1) * limit;

    const subscriptions = await this.backInStockModel
      .find(filter)
      .sort({ [sort]: asc as 1 | -1 })
      .skip(skip)
      .limit(limit)
      .populate('menuItemId')
      .exec();

    return {
      subscriptions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubscriptionById(id: number): Promise<BackInStockSubscription> {
    const subscription = await this.backInStockModel
      .findById(id)
      .populate('menuItemId')
      .exec();

    if (!subscription) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    return subscription;
  }

  async updateSubscriptionStatus(
    id: number,
    dto: UpdateSubscriptionStatusDto,
  ): Promise<BackInStockSubscription> {
    const subscription = await this.backInStockModel.findById(id);

    if (!subscription) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    subscription.status = dto.status;

    if (dto.status === SubscriptionStatus.NOTIFIED) {
      subscription.notifiedAt = new Date();
    } else if (dto.status === SubscriptionStatus.CANCELLED) {
      subscription.cancelledAt = new Date();
    }

    await subscription.save();
    this.logger.log(`Updated subscription ${id} status to ${dto.status}`);

    this.webSocketGateway.emitBackInStockChanged();

    return subscription;
  }

  async cancelSubscription(
    email: string,
    variantId: string,
  ): Promise<BackInStockSubscription> {
    const subscription = await this.backInStockModel.findOne({
      email,
      variantId,
      status: SubscriptionStatus.ACTIVE,
    });

    if (!subscription) {
      throw new NotFoundException(
        `Active subscription not found for ${email} - variant ${variantId}`,
      );
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();

    await subscription.save();
    this.logger.log(`Cancelled subscription ${subscription._id}`);

    this.webSocketGateway.emitBackInStockChanged();

    return subscription;
  }

  async getActiveSubscriptionsByVariant(
    variantId: string,
  ): Promise<BackInStockSubscription[]> {
    return this.backInStockModel
      .find({
        variantId,
        status: SubscriptionStatus.ACTIVE,
      })
      .exec();
  }

  async markAsNotified(id: number): Promise<BackInStockSubscription> {
    return this.updateSubscriptionStatus(id, {
      status: SubscriptionStatus.NOTIFIED,
    });
  }

  async unsubscribeByEmail(
    email: string,
    variantId?: string,
  ): Promise<{ cancelled: number; subscriptions: BackInStockSubscription[] }> {
    const query: any = {
      email,
      status: SubscriptionStatus.ACTIVE,
    };

    if (variantId) {
      query.variantId = variantId;
    }

    const subscriptions = await this.backInStockModel.find(query).exec();

    if (subscriptions.length === 0) {
      this.logger.log(
        `No active subscriptions found for ${email}${
          variantId ? ` - variant ${variantId}` : ''
        }`,
      );
      return { cancelled: 0, subscriptions: [] };
    }

    // Update all found subscriptions
    const updateResult = await this.backInStockModel.updateMany(query, {
      $set: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(
      `Cancelled ${updateResult.modifiedCount} subscription(s) for ${email}${
        variantId ? ` - variant ${variantId}` : ''
      }`,
    );

    this.webSocketGateway.emitBackInStockChanged();

    return {
      cancelled: updateResult.modifiedCount,
      subscriptions,
    };
  }
}
