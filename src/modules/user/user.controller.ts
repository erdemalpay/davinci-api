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
import { CreateUserDto, UserResponse } from './user.dto';
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

  @Post('/password')
  updatePassword(
    @ReqUser() user: User,
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    console.log({ user, oldPassword, newPassword });
    return this.userService.updatePassword(user, oldPassword, newPassword);
  }

  @ApiResponse({ type: [Role] })
  @Get('/roles')
  listRoles() {
    return this.userService.getRoles();
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
  updateUser(@Param('id') id: string, @Body() updateQuery: UpdateQuery<User>) {
    return this.userService.update(id, updateQuery);
  }
}
