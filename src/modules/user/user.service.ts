import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcrypt';
import { randomInt } from 'crypto';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import {
  AssignmentStatusEnum,
  AssignmentTypeEnum,
} from '../assignment/assignment.dto';
import { Assignment } from '../assignment/assignment.schema';
import { AssignmentService } from '../assignment/assignment.service';
import { Game } from '../game/game.schema';
import { GameService } from '../game/game.service';
import { GameplayService } from '../gameplay/gameplay.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { ActivityType } from './../activity/activity.dto';
import { ActivityService } from './../activity/activity.service';
import {
  CreateRoleDto,
  CreateUserDto,
  RoleEnum,
  UpdateRoleDto,
} from './user.dto';
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
    private readonly assignmentService: AssignmentService,
    private readonly activityService: ActivityService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {
    this.checkDefaultUser();
  }
  onModuleInit() {
    this.checkDefaultRoles();
  }

  private generateTempPassword(): string {
    return randomInt(100000, 1000000).toString();
  }

  async create(userProps: CreateUserDto) {
    const user = new this.userModel(
      userProps.imageUrl !== '' ? userProps : { ...userProps, imageUrl: null },
    );

    const randomNumber = this.generateTempPassword();

    user.password = await hash(randomNumber, 10);
    if (user._id !== 'dv') {
      user._id = usernamify(user.name);
    }
    user.active = true;
    await user.save();
    this.websocketGateway.emitUserChanged();
    return { ...user.toObject(), tempPassword: randomNumber };
  }

  async update(reqUser: User, id: string, updateQuery: UpdateQuery<User>) {
    if (reqUser.role?._id !== 1 && updateQuery.role !== undefined) {
      delete updateQuery.role;
    }
    const user = await this.userModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
    this.websocketGateway.emitUserChanged();
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
    if (reqUser.role?._id !== 1) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    const randomNumber = this.generateTempPassword();
    const hashedNewPassword = await hash(randomNumber, 10);
    const user = await this.update(reqUser, id, {
      password: hashedNewPassword,
    });
    return { ...user.toObject(), tempPassword: randomNumber };
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

    const gameAssignment =
      await this.assignmentService.findGameLearningAssignmentByUserAndGame(
        user._id,
        gameId,
      );

    if (gameAssignment) {
      if (updateType === UserGameUpdateType.ADD) {
        if (gameAssignment.status === AssignmentStatusEnum.COMPLETED) {
          throw new HttpException('Game already added', HttpStatus.BAD_REQUEST);
        }

        if (gameAssignment.status !== AssignmentStatusEnum.IN_PROGRESS) {
          await this.completeGameLearningTask(
            user,
            gameAssignment._id,
            learnDate,
            true,
          );
        }

        return this.userModel.findById(user._id).populate('role');
      }

      if (updateType === UserGameUpdateType.REMOVE) {
        if (gameAssignment.status === AssignmentStatusEnum.COMPLETED) {
          throw new HttpException(
            'Verified game cannot be removed',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (gameAssignment.status === AssignmentStatusEnum.IN_PROGRESS) {
          await this.completeGameLearningTask(
            user,
            gameAssignment._id,
            undefined,
            false,
          );

          return this.userModel.findById(user._id).populate('role');
        }
      }
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
    this.websocketGateway.emitUserChanged();

    return updateResult;
  }

  private assertGameLearningAssignment(assignment: Assignment) {
    if (!assignment) {
      throw new HttpException('Assignment not found', HttpStatus.NOT_FOUND);
    }

    if (assignment.assignmentType !== AssignmentTypeEnum.GAME_LEARNING) {
      throw new HttpException(
        'Assignment is not a game learning task',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private getAssignmentGameId(assignment: Assignment): number {
    const gameId = Number(
      typeof assignment.subject?.entityId === 'number'
        ? assignment.subject.entityId
        : assignment.subject?.entityId ?? NaN,
    );

    if (Number.isNaN(gameId)) {
      throw new HttpException(
        'Invalid game on assignment',
        HttpStatus.BAD_REQUEST,
      );
    }

    return gameId;
  }

  private getAssignmentAssignedToId(assignment: Assignment): string {
    return typeof assignment.assignedTo === 'object' &&
      assignment.assignedTo !== null
      ? String((assignment.assignedTo as { _id?: string })._id ?? '')
      : String(assignment.assignedTo);
  }

  private isGameAssignmentVerifier(user: User): boolean {
    return [RoleEnum.MANAGER, RoleEnum.GAMEMANAGER].includes(
      user.role?._id as RoleEnum,
    );
  }

  async completeGameLearningTask(
    user: User,
    assignmentId: number,
    learnDate?: string,
    isLearned = true,
  ) {
    const assignment = await this.assignmentService.findById(assignmentId);
    this.assertGameLearningAssignment(assignment);

    const assignedToId = this.getAssignmentAssignedToId(assignment);

    if (assignedToId !== user._id && !this.isGameAssignmentVerifier(user)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    if (assignment.verifiedAt) {
      throw new HttpException(
        'Verified assignment cannot be reverted',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updatedAssignment = await this.assignmentService.updateAssignment(
      assignmentId,
      isLearned
        ? {
            learnedAt: learnDate ? new Date(learnDate) : new Date(),
            status: AssignmentStatusEnum.IN_PROGRESS,
          }
        : {
            learnedAt: null,
            status: AssignmentStatusEnum.ASSIGNED,
          },
    );

    this.activityService
      .addActivity(
        user,
        isLearned
          ? ActivityType.COMPLETE_GAME_ASSIGNMENT
          : ActivityType.UNCOMPLETE_GAME_ASSIGNMENT,
        updatedAssignment,
      )
      .catch((error) => {
        console.error(
          'Failed to add complete game assignment activity:',
          error,
        );
      });

    this.websocketGateway.emitUserChanged();
    this.websocketGateway.emitAssignmentChanged();

    return {
      assignment: updatedAssignment,
      user: await this.userModel.findById(assignedToId).populate('role'),
    };
  }

  async verifyGameLearningTask(
    user: User,
    assignmentId: number,
    isVerified = true,
  ) {
    const assignment = await this.assignmentService.findById(assignmentId);
    this.assertGameLearningAssignment(assignment);

    if (!this.isGameAssignmentVerifier(user)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const assignedToId = this.getAssignmentAssignedToId(assignment);
    const gameId = this.getAssignmentGameId(assignment);

    const userDoc = await this.userModel.findById(assignedToId);
    if (!userDoc) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const gameExists = await this.gameService.getGameById(gameId);
    if (!gameExists) {
      throw new HttpException('Game not found', HttpStatus.NOT_FOUND);
    }

    if (isVerified) {
      if (!assignment.learnedAt) {
        throw new HttpException(
          'Assignment is not marked as learned yet',
          HttpStatus.BAD_REQUEST,
        );
      }

      const alreadyKnown = (userDoc.userGames ?? []).some(
        (userGame) => userGame.game === gameId,
      );

      if (!alreadyKnown) {
        userDoc.userGames = [
          ...(userDoc.userGames ?? []),
          {
            game: gameId,
            learnDate: assignment.learnedAt.toISOString().split('T')[0],
          },
        ];

        await userDoc.save();

        await this.activityService.addActivity(
          userDoc,
          ActivityType.GAME_LEARNED_ADD,
          { addedBy: user._id, ...gameExists.toObject() } as Game & {
            addedBy?: string;
          },
        );
      }
    } else {
      userDoc.userGames = (userDoc.userGames ?? []).filter(
        (userGame) => userGame.game !== gameId,
      );

      await userDoc.save();

      await this.activityService.addActivity(
        userDoc,
        ActivityType.GAME_LEARNED_REMOVE,
        gameExists,
      );
    }

    const updatedAssignment = await this.assignmentService.updateAssignment(
      assignmentId,
      isVerified
        ? {
            verifiedAt: new Date(),
            verifiedBy: user._id,
            status: AssignmentStatusEnum.COMPLETED,
          }
        : {
            verifiedAt: null,
            verifiedBy: null,
            status: AssignmentStatusEnum.IN_PROGRESS,
          },
    );

    this.activityService
      .addActivity(
        user,
        ActivityType.VERIFY_GAME_ASSIGNMENT,
        updatedAssignment,
      )
      .catch((error) => {
        console.error('Failed to add verify game assignment activity:', error);
      });

    this.websocketGateway.emitUserChanged();
    this.websocketGateway.emitAssignmentChanged();

    return {
      assignment: updatedAssignment,
      user: await this.userModel.findById(assignedToId).populate('role'),
    };
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

  async findUsersByIds(userIds: string[]) {
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .populate('role')
      .lean();
    return users;
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
    try {
      const redisMinimalUsers = await this.redisService.get(
        RedisKeys.MinimalUsers,
      );
      if (redisMinimalUsers) {
        return redisMinimalUsers;
      }
    } catch (error) {
      console.error('Failed to retrieve minimal users from Redis:', error);
    }

    try {
      const minimalUsers = await this.userModel
        .find({ active: true })
        .select('name _id role')
        .populate('role')
        .exec();

      if (minimalUsers.length > 0) {
        await this.redisService.set(RedisKeys.MinimalUsers, minimalUsers);
      }
      return minimalUsers;
    } catch (error) {
      console.error('Failed to retrieve minimal users from database:', error);
      throw new HttpException(
        'Could not retrieve minimal users',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async getRoles(): Promise<Role[]> {
    return this.roleModel.find();
  }

  async createRole(createRoleDto: CreateRoleDto): Promise<Role> {
    const role = new this.roleModel(createRoleDto);
    await role.save();
    return role;
  }

  async updateRole(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.roleModel.findByIdAndUpdate(id, updateRoleDto, {
      new: true,
    });
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    return role;
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
