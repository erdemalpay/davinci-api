import { Controller, Get, Body, Patch, Param, Delete } from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { UpdateGameplayDto } from './dto/update-gameplay.dto';

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameplayService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGameplayDto: UpdateGameplayDto,
  ) {
    return this.gameplayService.update(+id, updateGameplayDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gameplayService.remove(+id);
  }
}
