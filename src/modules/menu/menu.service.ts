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
    return this.categoryModel.find();
  }

  findAllItems() {
    return this.itemModel.find();
  }

  createCategory(createCategoryDto: CreateCategoryDto) {
    return this.categoryModel.create(createCategoryDto);
  }

  updateCategory(id: number, updates: UpdateQuery<MenuCategory>) {
    return this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCategory(id: number) {
    return this.categoryModel.findByIdAndRemove(id);
  }

  createItem(createItemDto: CreateItemDto) {
    return this.itemModel.create(createItemDto);
  }

  updateItem(id: number, updates: UpdateQuery<MenuCategory>) {
    return this.itemModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeItem(id: number) {
    return this.itemModel.findByIdAndRemove(id);
  }
}
