import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  AvailabilityQueryDto,
  CreateGroupEventDto,
  GroupEventListQueryDto,
  UpdateGroupEventStatusDto,
} from './group-event.dto';
import { GroupEventService } from './group-event.service';

@Controller('/group-events')
export class GroupEventController {
  constructor(private readonly groupEventService: GroupEventService) {}

  // davinciboardgame.com: seats left per hour on bookable days
  @Public()
  @Get('/public/availability')
  availability(@Query() query: AvailabilityQueryDto) {
    return this.groupEventService.availability(query.from, query.to);
  }

  // davinciboardgame.com: a group applies for an event
  @Public()
  @Post('/public')
  apply(@Body() dto: CreateGroupEventDto) {
    return this.groupEventService.createPublic(dto);
  }

  // Panel
  @Get()
  findAll(@Query() query: GroupEventListQueryDto) {
    return this.groupEventService.findAll(query);
  }

  @Patch('/:id/status')
  updateStatus(
    @Param('id') id: number,
    @Body() dto: UpdateGroupEventStatusDto,
    @ReqUser() user: User,
  ) {
    return this.groupEventService.updateStatus(Number(id), dto, user);
  }
}
