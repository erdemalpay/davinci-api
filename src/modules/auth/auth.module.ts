import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as config from 'config';
import { UserModule } from 'src/modules/user/user.module';
import { ActivityModule } from '../activity/activity.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';

@Module({
  imports: [
    ActivityModule,
    UserModule,
    PassportModule,
    JwtModule.register({
      secret: config.get('jwt.secret'),
      signOptions: { expiresIn: '365d' },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
