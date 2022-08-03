import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { PartialGameplayDto } from './dto/partial-gameplay.dto';

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
    @Query('location') location: string,
    @Query('field') field: string,
    @Query('limit') limit: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.gameplayService.groupByField({
      location,
      field,
      limit,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameplayService.findById(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGameplayDto: PartialGameplayDto,
  ) {
    return this.gameplayService.update(+id, updateGameplayDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gameplayService.remove(+id);
  }
}
