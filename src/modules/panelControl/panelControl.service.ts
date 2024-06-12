import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { Page } from './page.schema';
import { CreatePageDto } from './panelControl.dto';

@Injectable()
export class PanelControlService {
  constructor(@InjectModel(Page.name) private pageModel: Model<Page>) {}

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

  async removePage(id: string) {
    const page = await this.pageModel.findByIdAndRemove(id);
    return page;
  }

  async createMultiplePages(createPageDto: CreatePageDto[]) {
    const pages = createPageDto.map((page) => ({
      ...page,
      _id: usernamify(page.name),
    }));
    await this.pageModel.insertMany(pages);
    return pages;
  }
}
