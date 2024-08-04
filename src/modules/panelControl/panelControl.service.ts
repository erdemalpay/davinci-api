import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { User } from '../user/user.schema';
import { CheckoutCash } from './checkoutCash.schema';
import { Page } from './page.schema';
import { CreateCheckoutCashDto, CreatePageDto } from './panelControl.dto';

@Injectable()
export class PanelControlService {
  constructor(
    @InjectModel(Page.name) private pageModel: Model<Page>,
    @InjectModel(CheckoutCash.name)
    private checkoutCashModel: Model<CheckoutCash>,
  ) {}

  //pages
  findAllPages() {
    return this.pageModel.find();
  }

  async createPage(createPageDto: CreatePageDto) {
    const page = new this.pageModel({ ...createPageDto, permissionRoles: [] });
    page._id = usernamify(page.name);
    await page.save();
    return page;
  }

  async updatePage(id: string, updates: UpdateQuery<Page>) {
    // const oldPage = await this.pageModel.findById(id);
    const newPage = await this.pageModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    return newPage;
  }
  async getPage(id: string) {
    const page = await this.pageModel.findById(id);
    return page;
  }
  async removePage(id: string) {
    const page = await this.pageModel.findByIdAndRemove(id);
    return page;
  }

  async createMultiplePages(createPageDto: CreatePageDto[]) {
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
    return checkoutCash;
  }

  findAllCheckoutCash() {
    return this.checkoutCashModel
      .find()
      .populate('location')
      .populate({
        path: 'user',
        select: '-password',
      })
      .sort({ date: -1 });
  }

  async updateCheckoutCash(id: string, updates: UpdateQuery<CheckoutCash>) {
    const newCheckoutCash = await this.checkoutCashModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    return newCheckoutCash;
  }

  async removeCheckoutCash(id: string) {
    const checkoutCash = await this.checkoutCashModel.findByIdAndRemove(id);
    return checkoutCash;
  }
}
