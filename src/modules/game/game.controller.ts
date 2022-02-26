import { Delete, Get, Param, Query, HttpCode } from '@nestjs/common';

import { GameService } from './game.service';

export class GameController {
  constructor(private readonly GameService: GameService) {}

  @Get('/games')
  async getGames() {
    return this.GameService.getGames();
  }

  @Delete('/game/:id')
  @HttpCode(204)
  async deleteItem(@Param('id') id: number) {
    await this.GameService.deleteGame(id);
  }

  @Get('/game/:id')
  getItem(@Param('id') id: number) {
    return this.GameService.getGameById(id);
  }
}
