import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { CreateGameplayDto } from './dto/create-gameplay.dto';
import { UpdateGameplayDto } from './dto/update-gameplay.dto';

@Controller('gameplay')
export class GameplayController {
  constructor(private readonly gameplayService: GameplayService) {}

  @Post()
  create(@Body() createGameplayDto: CreateGameplayDto) {
    return this.gameplayService.create(createGameplayDto);
  }

  @Get()
  findAll() {
    return this.gameplayService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameplayService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGameplayDto: UpdateGameplayDto) {
    return this.gameplayService.update(+id, updateGameplayDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gameplayService.remove(+id);
  }
}
