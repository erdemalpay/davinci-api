import { hash, compare } from 'bcrypt';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from './user.schema';
import { CreateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    // this.checkDefaultUser();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(userProps);
    user.password = await hash('dv' /* temporary dummy password*/, 10);
    user.role = 'user';
    await user.save();
  }

  async update(id: string, updateQuery: UpdateQuery<User>) {
    return this.userModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
  }

  async findById(id: string): Promise<User | undefined> {
    return this.userModel.findById(id);
  }

  async getAll(filterInactives = true): Promise<User[]> {
    const query = filterInactives ? { active: true } : {};
    return this.userModel.find(query).sort({ _id: 1 });
  }

  async validateCredentials(
    _id: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.findById(_id);

    if (!user) {
      return null;
    }
    const isValid = await compare(password, user.password);

    return isValid ? user : null;
  }

  async checkDefaultUser() {
    const userProps: CreateUserDto = {
      _id: 'dvdv',
      name: '-',
      password: 'dvdv',
      active: true,
      role: 'admin',
    };

    const user = await this.findById(userProps._id);

    if (user) return;

    await this.create(userProps);

    console.log('Created default user.'); // eslint-disable-line no-console
  }
}
