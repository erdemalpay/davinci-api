import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldUserService } from './user.service';
import { User, OldUserSchema } from './user.schema';

const mongooseModule = MongooseModule.forFeature(
  [{ name: User.name, schema: OldUserSchema }],
  'olddb',
);

@Module({
  imports: [mongooseModule],
  providers: [OldUserService],
  exports: [OldUserService],
})
export class OldUserModule {}
