import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcrypt';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { GameService } from '../game/game.service';
import { GameplayService } from '../gameplay/gameplay.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { ActivityType } from './../activity/activity.dto';
import { ActivityService } from './../activity/activity.service';
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
    private readonly activityService: ActivityService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {
    this.checkDefaultUser();
  }
  onModuleInit() {
    this.checkDefaultRoles();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(
      userProps.imageUrl !== '' ? userProps : { ...userProps, imageUrl: null },
    );
    user.password = await hash('dv' /* temporary dummy password*/, 10);
    if (user._id !== 'dv') {
      user._id = usernamify(user.name);
    }
    user.active = true;
    await user.save();
    this.websocketGateway.emitUserChanged(user);
    return user;
  }

  async update(reqUser: User, id: string, updateQuery: UpdateQuery<User>) {
    if (reqUser.role?._id !== 1 && updateQuery.role !== undefined) {
      delete updateQuery.role;
    }
    const user = await this.userModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
    this.websocketGateway.emitUserChanged(user);
    return user;
  }

  async updatePassword(user: User, oldPassword: string, newPassword: string) {
    const isValid = await this.validateCredentials(user._id, oldPassword);
    if (!isValid) {
      throw new HttpException('Invalid password', HttpStatus.BAD_REQUEST);
    }
    const hashedNewPassword = await hash(newPassword, 10);
    return this.update(user, user._id, {
      password: hashedNewPassword,
    });
  }
  async checkUserActive(id: string) {
    const user = await this.userModel.findById(id);
    return user.active;
  }
  async resetUserPassword(reqUser: User, id: string) {
    const hashedNewPassword = await hash('dv', 10);
    return this.update(reqUser, id, {
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
      throw new HttpException('Game not found', HttpStatus.NOT_FOUND);
    }
    let newUserGames = user.userGames;
    if (updateType === UserGameUpdateType.ADD) {
      const userGameToAdd = {
        game: gameId,
        learnDate: learnDate,
      };

      if (user.userGames.some((ug) => ug.game === gameId)) {
        throw new HttpException('Game already added', HttpStatus.BAD_REQUEST);
      }
      newUserGames.push(userGameToAdd);

      this.activityService.addActivity(
        user,
        ActivityType.GAME_LEARNED_ADD,
        gameExists,
      );
    } else if (updateType === UserGameUpdateType.REMOVE) {
      newUserGames = user.userGames.filter((ug) => ug.game !== gameId);
      this.activityService.addActivity(
        user,
        ActivityType.GAME_LEARNED_REMOVE,
        gameExists,
      );
    }

    const updateResult = await this.userModel.findByIdAndUpdate(
      user._id,
      { userGames: newUserGames },
      { new: true },
    );
    if (!updateResult) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitUserChanged(updateResult);

    return updateResult;
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).populate('role');
    return user;
  }
  async searchUserIds(search: string) {
    const searchUserIds = await this.userModel
      .find({ name: { $regex: new RegExp(search, 'i') } })
      .select('_id')
      .then((docs) => docs.map((doc) => doc._id));
    return searchUserIds;
  }

  async findByIdWithoutPopulate(id: string) {
    const user = await this.userModel.findById(id);
    return user;
  }

  async getAll(filterInactives = true): Promise<User[]> {
    const query = filterInactives ? { active: true } : {};
    return this.userModel.find(query).populate('role').sort({ _id: 1 });
  }
  async findAllUsers() {
    try {
      const redisUsers = await this.redisService.get(RedisKeys.Users);
      if (redisUsers) {
        return redisUsers;
      }
    } catch (error) {
      console.error('Failed to retrieve users from Redis:', error);
    }
    try {
      const users = await this.userModel
        .find({ active: true })
        .populate('role')
        .sort({ _id: 1 })
        .exec();
      if (users.length > 0) {
        // Store retrieved users in Redis for caching
        await this.redisService.set(RedisKeys.Users, users);
      }
      return users;
    } catch (error) {
      console.error('Failed to retrieve users from database:', error);
      throw new HttpException('Could not retrieve users', HttpStatus.NOT_FOUND);
    }
  }

  async getUsersMinimal() {
    return this.userModel
      .find({ active: true })
      .select('name _id role')
      .populate('role');
  }

  async getRoles(): Promise<Role[]> {
    return this.roleModel.find();
  }
  async setKnownGames(reqUser: User) {
    const users = await this.getAll(false);
    users.forEach(async (user) => {
      const knownGames = await this.gameplayService.findEarliestGamesByMentor(
        user._id,
      );
      await this.update(reqUser, user._id, { userGames: knownGames });
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

  async findByCafeId(cafeId: string) {
    const users = await this.userModel.find({ cafeId: cafeId });
    return users[0];
  }
}
