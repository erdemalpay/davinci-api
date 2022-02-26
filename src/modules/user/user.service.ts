import { hash, compare } from 'bcrypt';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { CreateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    this.checkDefaultUser();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(userProps);
    user.password = await hash(userProps.password, 10);
    await user.save();
  }

  async findById(_id: string): Promise<User | undefined> {
    return this.userModel.findOne({ _id });
  }

  async getAll(): Promise<User[]> {
    return this.userModel.find({});
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
