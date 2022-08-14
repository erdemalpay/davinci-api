import { Get, Param, Controller, Post, Body, Patch } from '@nestjs/common';

import { GameService } from './game.service';
import { GameDto } from './game.dto';
import { Public } from '../auth/public.decorator';
import { UpdateQuery } from 'mongoose';
import { Game } from './game.schema';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('/details/:id')
  async getDetails(@Param('id') id: number) {
    return this.gameService.getGameDetails(id);
  }

  @Public()
  @Get()
  async getGames() {
    return this.gameService.getGames();
  }

  @Post()
  async addGame(@Body() game: GameDto) {
    return this.gameService.addGameByDetails(game);
  }

  @Patch('/:id')
  async updateGame(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Game>,
  ) {
    return this.gameService.update(id, updates);
  }

  @Get('/migrate')
  async migrateGames() {
    return this.gameService.migrateGames();
  }
}
