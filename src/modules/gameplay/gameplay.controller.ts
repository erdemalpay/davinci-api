import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { FieldGrouping } from './dto/gameplay-query.dto';
import { PartialGameplayDto } from './dto/partial-gameplay.dto';
import { GameplayService } from './gameplay.service';

@Controller('gameplays')
export class GameplayController {
  constructor(private readonly gameplayService: GameplayService) {}

  // We have removed this endpoint since gameplay creation will be done through table controller
  /* @Post()
  create(@Body() createGameplayDto: CreateGameplayDto) {
    return this.gameplayService.create(createGameplayDto);
  } */

  @Get()
  findAll() {
    return this.gameplayService.findAll();
  }

  @Get('/query')
  findByQuery(
    @Query('location') location: number,
    @Query('limit') limit: number,
    @Query('page') page: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('game') game?: number,
    @Query('mentor') mentor?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number,
  ) {
    return this.gameplayService.queryData({
      location,
      startDate,
      endDate,
      limit,
      page,
      game,
      mentor,
      sort,
      asc,
    });
  }

  @Get('/query-group')
  findByQueryGroup(
    @Query('location') location: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.gameplayService.queryGroupData({
      location,
      startDate,
      endDate,
      groupBy: groupBy?.split(',') as FieldGrouping[],
    });
  }
  @Get('/group-game-mentor-location')
  groupGameMentorLocation() {
    return this.gameplayService.groupGameMentorLocation();
  }

  @Get('/group')
  groupByQuery(
    @Query('location') location: string,
    @Query('field') field: string,
    @Query('limit') limit: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('mentor') mentor?: string,
  ) {
    return this.gameplayService.groupByField({
      location,
      field,
      limit,
      startDate,
      endDate,
      mentor,
    });
  }
  @Get('/mentor/:mentorId')
  findByMentor(@Param('mentorId') mentorId: string) {
    return this.gameplayService.findByMentor(mentorId);
  }

  @Get('/create_count')
  getAfterGivenDateMentorCounts(@Query('after') after: string) {
    return this.gameplayService.getAfterGivenDateMentorCounts(after);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameplayService.findById(+id);
  }

  @Patch(':id')
  update(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updateGameplayDto: PartialGameplayDto,
  ) {
    return this.gameplayService.update(user, +id, updateGameplayDto);
  }

  @Delete(':id')
  remove(@ReqUser() user: User, @Param('id') id: string) {
    return this.gameplayService.remove(user, +id);
  }
}
