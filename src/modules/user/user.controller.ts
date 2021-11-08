import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { UserResponse } from './user.dto';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/auth.guards';

@ApiCookieAuth('jwt')
@ApiTags('User')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/profile')
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
