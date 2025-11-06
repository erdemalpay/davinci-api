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

  @Patch('/:id/manager-approve')
  approveByManager(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updateDto: UpdateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.approveByManager(
      id,
      user._id,
      updateDto,
    );
  }

  @Patch('/:id/manager-reject')
  rejectByManager(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updateDto: UpdateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.rejectByManager(
      id,
      user._id,
      updateDto,
    );
  }

  @Patch('/:id/target-approve')
  approveByTargetUser(@ReqUser() user: User, @Param('id') id: number) {
    return this.shiftChangeRequestService.approveByTargetUser(id, user._id);
  }

  @Patch('/:id/target-reject')
  rejectByTargetUser(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updateDto: UpdateShiftChangeRequestDto,
  ) {
    return this.shiftChangeRequestService.rejectByTargetUser(
      id,
      user._id,
      updateDto,
    );
  }

  @Patch('/:id/cancel')
  cancelByRequester(@ReqUser() user: User, @Param('id') id: number) {
    return this.shiftChangeRequestService.cancelByRequester(id, user._id);
  }
}
