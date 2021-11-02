import { Controller, Request, Response, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { LoginCredentialsDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @ApiBody({ type: LoginCredentialsDto })
  @Post('/login')
  async login(@Request() req, @Response() res) {
    const { access_token } = await this.authService.login(req.user);

    res.cookie('jwt', access_token);
    res.status(204).end();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('/logout')
  async logout(@Response() res) {
    res.clearCookie('jwt');
    res.status(204).end();
  }
}
