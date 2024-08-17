import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
@Controller('/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('/query')
  findByQuery(
    @Query('limit') limit: number,
    @Query('page') page: number,
    @Query('type') type: string,
    @Query('user') user: string,
    @Query('date') date: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number,
  ) {
    return this.activityService.getActivities({
      user,
      date,
      page,
      type,
      limit,
      sort,
      asc,
    });
  }
}
