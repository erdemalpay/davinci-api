import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { UserResponse } from './user.dto';
import { UserService } from './user.service';
import { Request as Req } from 'express';
import { ReqUser } from './user.decorator';
import { User } from './user.schema';

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

  @ApiResponse({ type: [UserResponse] })
  @Get('/all')
  listUsers() {
    return this.userService.getAll();
  }
}
