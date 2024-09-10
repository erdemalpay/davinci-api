import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { User } from '../user/user.schema';
import { ReqUser } from './../user/user.decorator';
import {
  CreateMembershipDto,
  MembershipDto,
  MembershipResponse,
} from './membership.dto';
import { MembershipService } from './membership.service';
@Controller('/memberships')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  getMemberships() {
    return this.membershipService.findAll();
  }

  @Post()
  createMembership(
    @ReqUser() user: User,
    @Body() createMembershipDto: CreateMembershipDto,
  ) {
    return this.membershipService.create(user, createMembershipDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: MembershipResponse })
  updateMembership(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() membershipDto: MembershipDto,
  ) {
    return this.membershipService.update(user, id, membershipDto);
  }

  @Delete('/:id')
  @ApiResponse({ type: MembershipResponse })
  deleteMembership(@ReqUser() user: User, @Param('id') id: number) {
    return this.membershipService.remove(user, id);
  }
}
