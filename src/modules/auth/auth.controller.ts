import { Controller, Response, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../user/user.schema';
import { ReqUser } from '../user/user.decorator';
import { Response as Res } from 'express';
import { LocalAuthGuard, JwtAuthGuard } from './auth.guards';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { LoginCredentialsDto } from './auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginCredentialsDto })
  @Post('/login')
  async login(@ReqUser() user: User, @Response() res: Res) {
    const { access_token } = await this.authService.login(user);

    res.cookie('jwt', access_token, { sameSite: 'none', secure: process.env.NODE_ENV === 'production' });
    res.status(204).end();
  }

  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Response() res) {
    res.clearCookie('jwt');
    res.status(204).end();
  }
}
