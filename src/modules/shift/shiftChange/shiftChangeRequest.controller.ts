import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReqUser } from '../../user/user.decorator';
import { User } from '../../user/user.schema';
import {
  CreateShiftChangeRequestDto,
  ShiftChangeRequestFilterDto,
  UpdateShiftChangeRequestDto,
} from './shiftChangeRequest.dto';
import { ShiftChangeRequestService } from './shiftChangeRequest.service';

@Controller('/shift-change-request')
export class ShiftChangeRequestController {
  constructor(
    private readonly shiftChangeRequestService: ShiftChangeRequestService,
  ) {}

  @Post()
  createRequest(
    @ReqUser() user: User,
    @Body() createDto: CreateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.createRequest(user._id, createDto);
  }

  @Get('/my-requests')
  getMyRequests(
    @ReqUser() user: User,
    @Query() filterDto: ShiftChangeRequestFilterDto,
  ) {
    return this.shiftChangeRequestService.getMyRequests(user._id, filterDto);
  }

  @Get()
  getAllRequests(@Query() filterDto: ShiftChangeRequestFilterDto) {
    return this.shiftChangeRequestService.getAllRequests(filterDto);
  }

  @Patch('/:id/approve')
  approveRequest(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updateDto: UpdateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.approveRequest(
      id,
      user._id,
      updateDto,
    );
  }

  @Patch('/:id/reject')
  rejectRequest(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updateDto: UpdateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.rejectRequest(
      id,
      user._id,
      updateDto,
    );
  }
}
