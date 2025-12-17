import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from './user.decorator';
import {
  CreateRoleDto,
  CreateUserDto,
  UpdateRoleDto,
  UserResponse,
} from './user.dto';
import { UserGameUpdateType } from './user.enums';
import { Role } from './user.role.schema';
import { User } from './user.schema';
import { UserService } from './user.service';

@ApiCookieAuth('jwt')
@ApiTags('User')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/me')
  getProfile(@ReqUser() user: User) {
    return user;
  }

  @Get('/setKnownGames')
  setKnownGames(@ReqUser() reqUser: User) {
    return this.userService.setKnownGames(reqUser);
  }
  @Post('/password')
  updatePassword(
    @ReqUser() user: User,
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.userService.updatePassword(user, oldPassword, newPassword);
  }
  @Post('/resetPassword')
  resetUserPassword(@ReqUser() reqUser: User, @Body('id') id: string) {
    return this.userService.resetUserPassword(reqUser, id);
  }

  @Patch('/games')
  updateUserGames(
    @ReqUser() user: User,
    @Body('gameId') gameId: number,
    @Body('learnDate') learnDate: string,
    @Body('updateType') updateType: UserGameUpdateType,
  ): Promise<User | null> {
    return this.userService.updateUserGames(
      user,
      gameId,
      updateType,
      learnDate,
    );
  }

  @ApiResponse({ type: [Role] })
  @Get('/roles')
  listRoles() {
    return this.userService.getRoles();
  }

  @ApiResponse({ type: Role })
  @Post('/roles')
  createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.userService.createRole(createRoleDto);
  }

  @ApiResponse({ type: Role })
  @Patch('/roles/:id')
  updateRole(@Param('id') id: number, @Body() updateRoleDto: UpdateRoleDto) {
    return this.userService.updateRole(id, updateRoleDto);
  }

  @ApiResponse({ type: [UserResponse] })
  @Get('/minimal')
  getUsersMinimal() {
    return this.userService.getUsersMinimal();
  }

  @ApiResponse({ type: [UserResponse] })
  @Get()
  listUsers(@Query('all') all: boolean) {
    return this.userService.getAll(!all);
  }

  @ApiResponse({ type: [UserResponse] })
  @Post()
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: UserResponse })
  updateUser(
    @ReqUser() reqUser: User,
    @Param('id') id: string,
    @Body() updateQuery: UpdateQuery<User>,
  ) {
    return this.userService.update(reqUser, id, updateQuery);
  }
  @Get('/:id')
  @ApiResponse({ type: UserResponse })
  getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }
}
