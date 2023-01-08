import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { CreateUserDto, UserResponse } from './user.dto';
import { UserService } from './user.service';
import { ReqUser } from './user.decorator';
import { User } from './user.schema';
import { UpdateQuery } from 'mongoose';
import { Role } from './user.role.schema';

@ApiCookieAuth('jwt')
@ApiTags('User')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/me')
  @ApiResponse({ type: UserResponse })
  getProfile(@ReqUser() user: User) {
    return user;
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
