import { Controller, Post, Response, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Response as Res } from 'express';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { LoginCredentialsDto } from './auth.dto';
import { LocalAuthGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private activityService: ActivityService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginCredentialsDto })
  @Post('/login')
  async login(@ReqUser() user: User, @Response() res: Res) {
    const { access_token } = await this.authService.login(user);

    res.send({
      token: access_token,
      user: user,
    });
  }

  @Post('/logout')
  async logout(@ReqUser() user: User, @Response() res: Res) {
    this.activityService.addActivity(user, ActivityType.LOGOUT, null);
    res.clearCookie('jwt');
    res.status(204).end();
  }
}
