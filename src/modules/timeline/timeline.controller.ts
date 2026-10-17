import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { RoleEnum } from '../user/user.dto';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  LoadQueryDto,
  TableTimelineQueryDto,
  UserTimelineQueryDto,
} from './timeline.dto';
import { TimelineService } from './timeline.service';

// Managers only: what each person did through the day is not for everyone.
const assertManager = (user: User) => {
  if (user?.role?._id !== RoleEnum.MANAGER) {
    throw new ForbiddenException('Only managers can see timelines');
  }
};

@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get('/user')
  findUserTimeline(
    @ReqUser() user: User,
    @Query() query: UserTimelineQueryDto,
  ) {
    assertManager(user);
    return this.timelineService.findUserTimeline(query.user, query.date);
  }

  @Get('/table')
  findTableTimeline(
    @ReqUser() user: User,
    @Query() query: TableTimelineQueryDto,
  ) {
    assertManager(user);
    return this.timelineService.findTableTimeline(query.table);
  }

  @Get('/load')
  findLoad(@ReqUser() user: User, @Query() query: LoadQueryDto) {
    assertManager(user);
    return this.timelineService.findLoad(query.location, query.date);
  }

  @Get('/waiting-calls')
  findWaitingCalls(@ReqUser() user: User, @Query() query: LoadQueryDto) {
    assertManager(user);
    return this.timelineService.findWaitingCalls(query.location, query.date);
  }
}
