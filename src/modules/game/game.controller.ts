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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
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
  @Get()
  async getGames() {
    return this.gameService.getGames();
  }

  @Post()
  async addGame(@ReqUser() user: User, @Body() game: GameDto) {
    return this.gameService.addGameByDetails(user, game);
  }

  @Patch('/:id')
  async updateGame(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Game>,
  ) {
    return this.gameService.update(user, id, updates);
  }

  @Delete('/:id')
  async deleteGame(@ReqUser() user: User, @Param('id') id: number) {
    return this.gameService.remove(user, id);
  }

  @Get('/migrate')
  async migrateGames() {
    return this.gameService.migrateGames();
  }
}
