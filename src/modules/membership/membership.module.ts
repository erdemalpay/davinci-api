import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MembershipController } from './membership.controller';
import { Membership, MembershipSchema } from './membership.schema';
import { MembershipService } from './membership.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Membership.name, MembershipSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [MembershipService],
  exports: [MembershipService],
  controllers: [MembershipController],
})
export class MembershipModule {}
