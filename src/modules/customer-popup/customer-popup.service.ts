import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { CreateCustomerPopupDto } from './customer-popup.dto';
import { CustomerPopup, TriggerType } from './customer-popup.schema';

@Injectable()
export class CustomerPopupService {
  constructor(
    @InjectModel(CustomerPopup.name)
    private readonly customerPopupModel: Model<CustomerPopup>,
  ) {}

  findAll() {
    return this.customerPopupModel
      .find({ isDeleted: { $ne: true } })
      .sort({ _id: -1 })
      .exec();
  }

  /**
   * Returns the single active popup that should be shown today for the given location.
   * Day check is done on the server to prevent client-side manipulation.
   */
  async findActive(locationId: number): Promise<CustomerPopup | null> {
    const now = new Date();
    // ISO weekday: 1=Mon ... 7=Sun
    const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();
    // MM-DD string for special day comparison
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayMMDD = `${day}-${month}`;

    const popup = await this.customerPopupModel
      .findOne({
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
          {
            triggerType: TriggerType.BOTH,
            $or: [
              { periodicDays: todayWeekday },
              { specialDate: todayMMDD },
            ],
          },
        ],
      })
      .exec();

    return popup;
  }

  async create(dto: CreateCustomerPopupDto) {
    const popup = await this.customerPopupModel.create(dto);
    return popup;
  }

  async update(id: number, updates: UpdateQuery<CustomerPopup>) {
    return this.customerPopupModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
  }

  async remove(id: number) {
    return this.customerPopupModel
      .findByIdAndUpdate(id, { isDeleted: true }, { new: true })
      .exec();
  }
}
