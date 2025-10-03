import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
@Controller('/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('/query')
  findByQuery(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('type') type: string,
    @Query('user') user: string,
    @Query('date') date: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number,
  ) {
    return this.activityService.getActivities({
      page,
      limit,
      user,
      date,
      after,
      before,
      type,
      sort,
      asc,
    });
  }
}
