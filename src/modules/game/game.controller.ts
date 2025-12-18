import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { GameDto } from './game.dto';
import { Game } from './game.schema';
import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('/details/:id')
  async getDetails(@Param('id') id: number) {
    return this.gameService.getGameDetails(id);
  }

  @Public()
  @Get('/minimal')
  async getGamesMinimal() {
    return this.gameService.getGamesMinimal();
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

  @Delete('/:id')
  async deleteGame(@Param('id') id: number) {
    return this.gameService.remove(id);
  }

  @Get('/migrate')
  async migrateGames() {
    return this.gameService.migrateGames();
  }
}
