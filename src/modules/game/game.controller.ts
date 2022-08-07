import { Get, Param, Controller, Post, Body } from '@nestjs/common';

import { GameService } from './game.service';
import { GameDto } from './game.dto';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('/details/:id')
  async getDetails(@Param('id') id: number) {
    return this.gameService.getGameDetails(id);
  }

  @Get()
  async getGames() {
    return this.gameService.getGames();
  }

  @Post()
  async addGame(@Body() game: GameDto) {
    return this.gameService.addGameByDetails(game);
  }

  @Get('/migrate')
  async migrateGames() {
    return this.gameService.migrateGames();
  }
}
