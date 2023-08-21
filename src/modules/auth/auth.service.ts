import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/modules/user/user.schema';
import { UserService } from 'src/modules/user/user.service';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private activityService: ActivityService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    return this.userService.validateCredentials(username, password);
  }

  async login(user: User) {
    const payload = {
      username: user._id,
    };

    this.activityService.addActivity(user, ActivityType.LOGIN, null);

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
