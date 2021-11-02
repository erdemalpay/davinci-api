import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User, UserSchema } from './user.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(User.name, UserSchema),
]);
@Module({
  imports: [mongooseModule],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
