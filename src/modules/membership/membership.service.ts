import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateMembershipDto, MembershipDto } from './membership.dto';
import { Membership } from './membership.schema';

export class MembershipService {
  constructor(
    @InjectModel(Membership.name) private membershipModel: Model<Membership>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {}

  async findAll() {
    try {
      const redisMemberships = await this.redisService.get(
        RedisKeys.Memberships,
      );
      if (redisMemberships) {
        return redisMemberships;
      }
    } catch (error) {
      console.error('Failed to retrieve memberships from Redis:', error);
    }

    try {
      const memberships = await this.membershipModel.find().exec();

      if (memberships.length > 0) {
        await this.redisService.set(RedisKeys.Memberships, memberships);
      }
      return memberships;
    } catch (error) {
      console.error('Failed to retrieve memberships from database:', error);
      throw new HttpException(
        'Could not retrieve memberships',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async create(createMembershipDto: CreateMembershipDto) {
    const membership = await this.membershipModel.create(createMembershipDto);
    this.websocketGateway.emitMembershipChanged();
    return membership;
  }

  async update(id: number, membershipDto: MembershipDto) {
    const membership = await this.membershipModel.findByIdAndUpdate(
      id,
      membershipDto,
      {
        new: true,
      },
    );
    this.websocketGateway.emitMembershipChanged();
    return membership;
  }

  async remove(id: number) {
    const membership = await this.membershipModel.findByIdAndRemove(id);
    this.websocketGateway.emitMembershipChanged();
    return membership;
  }
}
