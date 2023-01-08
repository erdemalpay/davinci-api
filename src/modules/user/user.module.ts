import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User, UserSchema } from './user.schema';
import { Role, RoleSchema } from './user.role.schema';
import { createAutoIncrementConfig } from '../../lib/autoIncrement';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: User.name, useFactory: () => UserSchema },
  createAutoIncrementConfig(Role.name, RoleSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
