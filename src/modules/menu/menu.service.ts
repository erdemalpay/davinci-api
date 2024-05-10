import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { Popular } from './popular.schema';

import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { CreateCategoryDto, CreateItemDto, CreatePopularDto } from './menu.dto';

export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
    @InjectModel(Popular.name) private popularModel: Model<Popular>,
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
      locations: [1, 2],
    });
  }

  updateCategory(id: number, updates: UpdateQuery<MenuCategory>) {
    return this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeCategory(id: number) {
    try {
      const categories = await this.categoryModel.find();
      const deletedCategory = categories.find(
        (category) => category._id.toString() === id.toString(),
      );
      categories?.forEach(async (category) => {
        if (category?.order > deletedCategory?.order) {
          await this.categoryModel.findByIdAndUpdate(category._id, {
            order: category?.order - 1,
          });
        }
      });
    } catch (error) {
      throw new Error('Problem occured while deleting category');
    }
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
    if (updates.hasOwnProperty('price')) {
      const item = await this.itemModel.findById(id);
      if (!item) {
        throw new Error('Item not found');
      }
      updates.priceHistory =
        item.price !== updates.price
          ? [
              ...item.priceHistory,
              {
                price: updates.price,
                date: new Date().toISOString(),
              },
            ]
          : item.priceHistory;
    }
    return this.itemModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeItem(id: number) {
    return this.itemModel.findByIdAndRemove(id);
  }

  // popular
  async findAllPopular() {
    return this.popularModel.find().populate('item').sort({ order: 'asc' });
  }

  async createPopular(createPopularDto: CreatePopularDto) {
    const popularItems = await this.popularModel.find().populate('item');
    const lastItem = popularItems[popularItems?.length - 1];

    return this.popularModel.create({
      ...createPopularDto,
      order: lastItem ? lastItem.order + 1 : 1,
    });
  }

  async removePopular(id: number) {
    return this.popularModel.findOneAndDelete({ item: id });
  }
  async updatePopular(id: number, updates: UpdateQuery<Popular>) {
    return this.popularModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async updateCategoryLocations() {
    await this.categoryModel.updateMany({
      $set: { locations: [1, 2] },
    });
  }
  async updateMenuItemProduct(stayedProduct: string, removedProduct: string) {
    const items = await this.itemModel.find();

    items.forEach(async (item) => {
      let isUpdated = false;
      const updatedItemProduction = item.itemProduction.map(
        (itemProduction) => {
          if (itemProduction.product === removedProduct) {
            isUpdated = true;
            return {
              ...itemProduction,
              product: stayedProduct,
            };
          }
          return itemProduction;
        },
      );
      if (isUpdated) {
        await this.itemModel.findByIdAndUpdate(item._id, {
          $set: { itemProduction: updatedItemProduction },
        });
      }
    });
  }
}
