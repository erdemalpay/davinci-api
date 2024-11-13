import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { CheckoutCash } from './checkoutCash.schema';
import { Page } from './page.schema';
import {
  CreateCheckoutCashDto,
  CreatePageDto,
  CreatePanelSettingsDto,
} from './panelControl.dto';
import { PanelControlGateway } from './panelControl.gateway';
import { PanelSettings } from './panelSettings.schema';

@Injectable()
export class PanelControlService {
  constructor(
    @InjectModel(Page.name) private pageModel: Model<Page>,
    @InjectModel(CheckoutCash.name)
    private checkoutCashModel: Model<CheckoutCash>,
    @InjectModel(PanelSettings.name)
    private panelSettingsModel: Model<PanelSettings>,
    private readonly panelControlGateway: PanelControlGateway,
    private readonly redisService: RedisService,
  ) {}

  //pages
  async findAllPages() {
    try {
      const redisPages = await this.redisService.get(RedisKeys.Pages);
      if (redisPages) {
        return redisPages;
      }
    } catch (error) {
      console.error('Failed to retrieve pages from Redis:', error);
    }
    try {
      const pages = await this.pageModel.find();
      if (pages.length > 0) {
        await this.redisService.set(RedisKeys.Pages, pages);
      }
      return pages;
    } catch (error) {
      console.error('Failed to retrieve pages from database:', error);
      throw new Error('Could not retrieve pages');
    }
  }

  async createPage(user: User, createPageDto: CreatePageDto) {
    const page = new this.pageModel({ ...createPageDto, permissionRoles: [] });
    page._id = usernamify(page.name);
    await page.save();
    this.panelControlGateway.emitPageChanged(user, page);
    return page;
  }

  async updatePage(user: User, id: string, updates: UpdateQuery<Page>) {
    // const oldPage = await this.pageModel.findById(id);
    const newPage = await this.pageModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.panelControlGateway.emitPageChanged(user, newPage);

    return newPage;
  }
  async getPage(id: string) {
    const page = await this.pageModel.findById(id);
    return page;
  }
  async removePage(user: User, id: string) {
    const page = await this.pageModel.findByIdAndRemove(id);
    this.panelControlGateway.emitPageChanged(user, page);
    return page;
  }

  async createMultiplePages(user: User, createPageDto: CreatePageDto[]) {
    const pagesWithIds = createPageDto.map((page) => ({
      ...page,
      _id: usernamify(page.name),
    }));
    const idsToRemove = pagesWithIds.map((page) => page._id);
    const page = await this.pageModel.find({ _id: { $in: idsToRemove } });
    if (page) {
      await this.pageModel.deleteMany({ _id: { $in: idsToRemove } });
    }
    await this.pageModel.insertMany(pagesWithIds);
    this.panelControlGateway.emitPageChanged(user, pagesWithIds);
    return pagesWithIds;
  }

  //checkout cash
  async createCheckoutCash(
    user: User,
    createCheckoutCashDto: CreateCheckoutCashDto,
  ) {
    const checkoutCash = new this.checkoutCashModel({
      ...createCheckoutCashDto,
      user: user._id,
    });
    await checkoutCash.save();
    this.panelControlGateway.emitCheckoutCashChanged(user, checkoutCash);
    return checkoutCash;
  }

  findAllCheckoutCash() {
    return this.checkoutCashModel.find().sort({ date: -1 });
  }

  async updateCheckoutCash(
    user: User,
    id: string,
    updates: UpdateQuery<CheckoutCash>,
  ) {
    const newCheckoutCash = await this.checkoutCashModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.panelControlGateway.emitCheckoutCashChanged(user, newCheckoutCash);

    return newCheckoutCash;
  }

  async removeCheckoutCash(user: User, id: string) {
    const checkoutCash = await this.checkoutCashModel.findByIdAndRemove(id);
    this.panelControlGateway.emitCheckoutCashChanged(user, checkoutCash);

    return checkoutCash;
  }
  // panel settings
  async findPanelSettings() {
    const panelSettings = await this.panelSettingsModel.find();
    return panelSettings[0];
  }
  async isWeekend() {
    const today = new Date();
    const day = today.getDay();
    const panelSetting = await this.findPanelSettings();
    if (panelSetting?.isHoliday) {
      return true;
    }
    return day === 0 || day === 6;
  }

  async createPanelSetting(
    user: User,
    createPanelSettingsDto: CreatePanelSettingsDto,
  ) {
    const panelSetting = await this.findPanelSettings();
    if (panelSetting) {
      const newPanelSetting = await this.panelSettingsModel.findByIdAndUpdate(
        panelSetting._id,
        createPanelSettingsDto,
        {
          new: true,
        },
      );
      this.panelControlGateway.emitPanelSettingsChanged(user, newPanelSetting);
      return newPanelSetting;
    }
    const newPanelSetting = await this.panelSettingsModel.create(
      createPanelSettingsDto,
    );
    this.panelControlGateway.emitPanelSettingsChanged(user, newPanelSetting);
    return newPanelSetting;
  }
}
