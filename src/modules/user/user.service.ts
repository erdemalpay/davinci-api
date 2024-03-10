import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcrypt';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { GameService } from '../game/game.service';
import { GameplayService } from '../gameplay/gameplay.service';
import { CreateUserDto } from './user.dto';
import { RolePermissionEnum, UserGameUpdateType } from './user.enums';
import { Role } from './user.role.schema';
import { User } from './user.schema';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    private readonly gameService: GameService,
    private readonly gameplayService: GameplayService,
  ) {
    this.checkDefaultUser();
  }
  onModuleInit() {
    this.checkDefaultRoles();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(userProps);
    user.password = await hash('dv' /* temporary dummy password*/, 10);
    user._id = usernamify(user.name);
    user.active = true;
    await user.save();
  }

  async update(id: string, updateQuery: UpdateQuery<User>) {
    return this.userModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
  }

  async updatePassword(user: User, oldPassword: string, newPassword: string) {
    const isValid = await this.validateCredentials(user._id, oldPassword);
    if (!isValid) throw new Error('Password not correct');
    const hashedNewPassword = await hash(newPassword, 10);
    return this.update(user._id, {
      password: hashedNewPassword,
    });
  }

  async updateUserGames(
    user: User,
    gameId: number,
    updateType: UserGameUpdateType,
    learnDate: string,
  ): Promise<User | null> {
    const gameExists = await this.gameService.getGameById(gameId);
    if (!gameExists) {
      throw new Error('Game not found');
    }
    let newUserGames = user.userGames;
    if (updateType === UserGameUpdateType.ADD) {
      const userGameToAdd = {
        game: gameId,
        learnDate: learnDate,
      };

      if (user.userGames.some((ug) => ug.game === gameId)) {
        throw new Error('Game already added');
      }
      newUserGames.push(userGameToAdd);
    } else if (updateType === UserGameUpdateType.REMOVE) {
      newUserGames = user.userGames.filter((ug) => ug.game !== gameId);
    }

    // Perform the update operation
    const updateResult = await this.userModel.findByIdAndUpdate(
      user._id,
      { userGames: newUserGames },
      { new: true },
    );

    if (!updateResult) {
      throw new Error('User not found');
    }

    return updateResult;
  }

  async findById(id: string): Promise<User | undefined> {
    return this.userModel.findById(id).populate('role');
  }

  async getAll(filterInactives = true): Promise<User[]> {
    const query = filterInactives ? { active: true } : {};
    return this.userModel.find(query).populate('role').sort({ _id: 1 });
  }

  async getRoles(): Promise<Role[]> {
    return this.roleModel.find();
  }
  async setKnownGames() {
    const users = await this.getAll(false);
    users.forEach(async (user) => {
      const knownGames = await this.gameplayService.findEarliestGamesByMentor(
        user._id,
      );
      await this.update(user._id, { userGames: knownGames });
    });
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
      _id: 'dv',
      name: '-',
      password: 'dvdv',
      fullName: '',
      active: true,
      imageUrl: '',
    };

    const user = await this.findById(userProps._id);

    if (user) return;

    await this.create(userProps);

    console.log('Created default user dv.'); // eslint-disable-line no-console
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
      permissions: [RolePermissionEnum.OPERATION],
    });

    await this.roleModel.create({
      name: 'Game Manager',
      color: '#d63031',
      permissions: [
        RolePermissionEnum.OPERATION,
        RolePermissionEnum.MANAGEMENT,
      ],
    });

    await this.roleModel.create({
      name: 'Catering Manager',
      color: '#00cec9',
      permissions: [
        RolePermissionEnum.OPERATION,
        RolePermissionEnum.MANAGEMENT,
      ],
    });

    await this.roleModel.create({
      name: 'Barista',
      color: '#b8e994',
      permissions: [RolePermissionEnum.OPERATION],
    });

    await this.roleModel.create({
      name: 'Kitchen',
      color: '#a29bfe',
      permissions: [RolePermissionEnum.OPERATION],
    });

    await this.roleModel.create({
      name: 'Service',
      color: '#4a69bd',
      permissions: [RolePermissionEnum.OPERATION],
    });

    await this.roleModel.create({
      name: 'Cleaning',
      color: '#82ccdd',
      permissions: [RolePermissionEnum.OPERATION],
    });

    console.log('Created default roles.'); // eslint-disable-line no-console
  }
}
