import {
  Delete,
  Get,
  Param,
  Query,
  HttpCode,
  Controller,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';

import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  async getGames() {
    return this.gameService.getGames();
  }

  @Get('/migrate')
  async migrateGames() {
    return this.gameService.migrateGames();
  }
}
