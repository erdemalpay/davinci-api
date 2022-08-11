import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Membership } from './membership.schema';
import { CreateMembershipDto, MembershipDto } from './membership.dto';

export class MembershipService {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<Membership>,
  ) {}

  findAll() {
    return this.membershipModel.find();
  }

  create(createMembershipDto: CreateMembershipDto) {
    return this.membershipModel.create(createMembershipDto);
  }

  async update(id: number, membershipDto: MembershipDto) {
    return this.membershipModel.findByIdAndUpdate(id, membershipDto, {
      new: true,
    });
  }
  remove(id: number) {
    return this.membershipModel.findByIdAndRemove(id);
  }
}
