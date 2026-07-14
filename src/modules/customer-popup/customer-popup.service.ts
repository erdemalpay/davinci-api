import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateCustomerPopupDto } from './customer-popup.dto';
import { CustomerPopup, TriggerType } from './customer-popup.schema';

@Injectable()
export class CustomerPopupService {
  constructor(
    @InjectModel(CustomerPopup.name)
    private readonly customerPopupModel: Model<CustomerPopup>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findAll() {
    return this.customerPopupModel
      .find({ isDeleted: { $ne: true } })
      .sort({ _id: -1 })
      .exec();
  }

  /**
   * Returns all active popups that should be shown today for the given location.
   * Special day popups come first, then periodic ones.
   * Day check is done on the server to prevent client-side manipulation.
   */
  async findActive(locationId: number): Promise<CustomerPopup[]> {
    const now = new Date();
    // ISO weekday: 1=Mon ... 7=Sun
    const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
    // DD-MM string for special day comparison
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayMMDD = `${day}-${month}`;

    const popups = await this.customerPopupModel
      .find({
        isDeleted: { $ne: true },
        isActive: true,
        locations: locationId,
        $or: [
          {
            triggerType: TriggerType.PERIODIC,
            periodicDays: todayWeekday,
          },
          {
            triggerType: TriggerType.SPECIAL_DAY,
            specialDate: todayMMDD,
          },
        ],
      })
      .exec();

    // special_day önce, periodic sonra
    return popups.sort((a, b) => {
      if (a.triggerType === TriggerType.SPECIAL_DAY && b.triggerType !== TriggerType.SPECIAL_DAY) return -1;
      if (a.triggerType !== TriggerType.SPECIAL_DAY && b.triggerType === TriggerType.SPECIAL_DAY) return 1;
      return 0;
    });
  }

  async create(dto: CreateCustomerPopupDto) {
    const popup = await this.customerPopupModel.create(dto);
    this.websocketGateway.emitCustomerPopupChanged();
    return popup;
  }

  async update(id: number, updates: UpdateQuery<CustomerPopup>) {
    const popup = await this.customerPopupModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
    this.websocketGateway.emitCustomerPopupChanged();
    return popup;
  }

  async remove(id: number) {
    const popup = await this.customerPopupModel
      .findByIdAndUpdate(id, { isDeleted: true }, { new: true })
      .exec();
    this.websocketGateway.emitCustomerPopupChanged();
    return popup;
  }

  /**
   * Popups that auto-close on stock-out, watching this item, targeting this location.
   */
  findPopupsWatchingItem(itemId: number, locationId: number) {
    return this.customerPopupModel
      .find({
        isDeleted: { $ne: true },
        isAutoClosedWhenOutOfStock: true,
        selectedMenuItems: itemId,
        locations: locationId,
      })
      .exec();
  }

  async setActive(id: number, isActive: boolean) {
    const popup = await this.customerPopupModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();
    this.websocketGateway.emitCustomerPopupChanged();
    return popup;
  }
}
