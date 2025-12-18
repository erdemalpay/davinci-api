import {
  Body,
  Controller, Get,
  Param,
  Patch,
  Query
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
    @Query('search') search?: string,
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
      search,
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

  @Get('/query-given-date')
  findByQueryGivenDate(
    @Query('date') date: string,
    @Query('location') location: number,
  ) {
    return this.gameplayService.givenDateTopMentorAndComplexGames(
      date,
      location,
    );
  }

  @Get('/by-date')
  getGameplaysByDate(@Query('date') date: string) {
    return this.gameplayService.getGameplaysByDate(date);
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
  getAfterGivenDateCreatedByCounts(
    @Query('after') after: string,
    @Query('before') before?: string,
  ) {
    return this.gameplayService.getAfterGivenDateCreatedByCounts(after, before);
  }

  @Get('/mentored_count')
  getAfterGivenDateMentoredCounts(
    @Query('after') after: string,
    @Query('before') before?: string,
  ) {
    return this.gameplayService.getAfterGivenDateMentoredCounts(after, before);
  }

  @Get('/counts-by-date')
  getGameplayCountsByDate(@Query('mentorId') mentorId: string) {
    return this.gameplayService.getGameplayCountsByDate(mentorId);
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
}
