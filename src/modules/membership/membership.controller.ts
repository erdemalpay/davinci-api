import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MembershipService } from './membership.service';
import { CreateMembershipDto } from './membership.dto';
import { ApiResponse } from '@nestjs/swagger';
import { MembershipDto, MembershipResponse } from './membership.dto';

@Controller('/memberships')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  getMemberships() {
    return this.membershipService.findAll();
  }

  @Post()
  createMembership(@Body() createMembershipDto: CreateMembershipDto) {
    return this.membershipService.create(createMembershipDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: MembershipResponse })
  updateMembership(
    @Param('id') id: number,
    @Body() membershipDto: MembershipDto,
  ) {
    return this.membershipService.update(id, membershipDto);
  }

  @Delete('/:id')
  @ApiResponse({ type: MembershipResponse })
  deleteMembership(@Param('id') id: number) {
    return this.membershipService.remove(id);
  }
}
