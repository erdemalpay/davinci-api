import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { GameDto } from './game.dto';
import { Game } from './game.schema';
import { GameService } from './game.service';
import { RequestGameDto } from './requested-game.dto';
import { RequestedGame } from './requested-game.schema';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('/details/:id')
  async getDetails(@Param('id') id: number) {
    return this.gameService.getGameDetails(id);
  }

  @Public()
  @Get('/bgg')
  async getBggGamesOnly() {
    return this.gameService.getBggGamesOnly();
  }

  @Get('/requested')
  async getRequestedGames(@Query('status') status?: string) {
    return this.gameService.getRequestedGames(status);
  }

  @Post('/requested/adjust-statuses')
  async adjustRequestedGameStatuses() {
    return this.gameService.adjustRequestedGameStatuses();
  }

  @Public()
  @Post('/requested')
  async requestGame(@Body() requestGameDto: RequestGameDto) {
    return this.gameService.requestGame(requestGameDto);
  }

  @Patch('/requested/:id')
  async updateRequestedGame(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<RequestedGame>,
  ) {
    return this.gameService.updateRequestedGame(id, updates);
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
