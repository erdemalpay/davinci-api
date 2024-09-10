import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../user/user.schema';
import { CreateMembershipDto, MembershipDto } from './membership.dto';
import { MembershipGateway } from './membership.gateway';
import { Membership } from './membership.schema';

export class MembershipService {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<Membership>,
    private readonly membershipGateway: MembershipGateway,
  ) {}

  findAll() {
    return this.membershipModel.find();
  }

  async create(user: User, createMembershipDto: CreateMembershipDto) {
    const membership = await this.membershipModel.create(createMembershipDto);
    this.membershipGateway.emitMembershipChanged(user, membership);
    return membership;
  }

  async update(user: User, id: number, membershipDto: MembershipDto) {
    const membership = await this.membershipModel.findByIdAndUpdate(
      id,
      membershipDto,
      {
        new: true,
      },
    );
    this.membershipGateway.emitMembershipChanged(user, membership);
    return membership;
  }

  async remove(user: User, id: number) {
    const membership = await this.membershipModel.findByIdAndRemove(id);
    this.membershipGateway.emitMembershipChanged(user, membership);
    return membership;
  }
}
