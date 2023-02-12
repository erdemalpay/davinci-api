import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcrypt';
import { Model, UpdateQuery } from 'mongoose';
import { CreateUserDto } from './user.dto';
import { RolePermissionEnum } from './user.enums';
import { Role } from './user.role.schema';
import { User } from './user.schema';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
  ) {
    // this.checkDefaultUser();
  }
  onModuleInit() {
    this.checkDefaultRoles();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(userProps);
    user.password = await hash('dv' /* temporary dummy password*/, 10);
    await user.save();
  }

  async update(id: string, updateQuery: UpdateQuery<User>) {
    return this.userModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
  }

  async updatePassword(user: User, oldPassword: string, newPassword: string) {
    const isValid = await this.validateCredentials(user._id, oldPassword);
    console.log({ isValid });
    if (!isValid) throw new Error('Password not correct');
    const hashedNewPassword = await hash(newPassword, 10);
    return this.update(user._id, {
      password: hashedNewPassword,
    });
  }

  async findById(id: string): Promise<User | undefined> {
    return this.userModel.findById(id);
  }

  async getAll(filterInactives = true): Promise<User[]> {
    const query = filterInactives ? { active: true } : {};
    return this.userModel.find(query).populate('role').sort({ _id: 1 });
  }

  async getRoles(): Promise<Role[]> {
    return this.roleModel.find();
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
    };

    const user = await this.findById(userProps._id);

    if (user) return;

    await this.create(userProps);

    console.log('Created default user.'); // eslint-disable-line no-console
  }

  async checkDefaultRoles() {
    const roles = await this.roleModel.find();
    if (roles.length) return;

    await this.roleModel.create({
      name: 'Manager',
      color: '#e17055',
      permissions: Object.values(RolePermissionEnum),
    });

    await this.roleModel.create({
      name: 'Game Master',
      color: '#74b9ff',
    });

    await this.roleModel.create({
      name: 'Game Manager',
      color: '#d63031',
    });

    await this.roleModel.create({
      name: 'Catering Manager',
      color: '#00cec9',
    });

    await this.roleModel.create({
      name: 'Barista',
      color: '#b8e994',
    });

    await this.roleModel.create({
      name: 'Kitchen',
      color: '#a29bfe',
    });

    await this.roleModel.create({
      name: 'Service',
      color: '#4a69bd',
    });

    await this.roleModel.create({
      name: 'Cleaning',
      color: '#82ccdd',
    });

    console.log('Created default roles.'); // eslint-disable-line no-console
  }
}
