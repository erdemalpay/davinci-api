import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from '../../lib/autoIncrement';
import { GameModule } from '../game/game.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { ActivityModule } from './../activity/activity.module';
import { UserController } from './user.controller';
import { UserGateway } from './user.gateway';
import { Role, RoleSchema } from './user.role.schema';
import { User, UserSchema } from './user.schema';
import { UserService } from './user.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: User.name, useFactory: () => UserSchema },
  createAutoIncrementConfig(Role.name, RoleSchema),
]);

@Module({
  imports: [mongooseModule, GameModule, GameplayModule, ActivityModule],
  providers: [UserService, UserGateway],
  exports: [UserService, UserGateway],
  controllers: [UserController],
})
export class UserModule {}
