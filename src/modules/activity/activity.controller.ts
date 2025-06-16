import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
@Controller('/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('/query')
  findByQuery(
    @Query('type') type: string,
    @Query('user') user: string,
    @Query('date') date: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
  ) {
    return this.activityService.getActivities({
      user,
      date,
      after,
      before,
      type,
    });
  }
}
