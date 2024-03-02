import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';

import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { CreateCategoryDto, CreateItemDto } from './menu.dto';

export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
  ) {}

  findAllCategories() {
    return this.categoryModel.find().sort({ order: 'asc' });
  }

  findAllItems() {
    return this.itemModel.find().populate('category').sort({ order: 'asc' });
  }
  async setOrder() {
    const items = await this.itemModel.find();
    items.forEach(async (item, index) => {
      await this.itemModel.findByIdAndUpdate(item._id, { order: index + 1 });
    });
  }

  async createCategory(createCategoryDto: CreateCategoryDto) {
    const lastCategory = await this.categoryModel
      .findOne({})
      .sort({ order: 'desc' });
    return this.categoryModel.create({
      ...createCategoryDto,
      order: lastCategory ? lastCategory.order + 1 : 1,
    });
  }

  updateCategory(id: number, updates: UpdateQuery<MenuCategory>) {
    return this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCategory(id: number) {
    return this.categoryModel.findByIdAndRemove(id);
  }

  async createItem(createItemDto: CreateItemDto) {
    const lastItem = await this.itemModel.findOne({}).sort({ order: 'desc' });
    return this.itemModel.create({
      ...createItemDto,
      order: lastItem ? lastItem.order + 1 : 1,
    });
  }

  async updateItem(id: number, updates: UpdateQuery<MenuCategory>) {
    return this.itemModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeItem(id: number) {
    return this.itemModel.findByIdAndRemove(id);
  }
}
