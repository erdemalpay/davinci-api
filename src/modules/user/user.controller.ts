import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { UserResponse } from './user.dto';
import { UserService } from './user.service';

@ApiCookieAuth('jwt')
@ApiTags('User')
@UseGuards(AuthGuard('jwt'))
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/user')
  @ApiResponse({ type: UserResponse })
  getProfile(@Request() req) {
    return req.user;
  }

  @ApiResponse({ type: [UserResponse] })
  @Get('/users')
  listUsers() {
    return this.userService.getAll();
  }
}
