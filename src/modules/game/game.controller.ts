import {
  Delete,
  Get,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { GetListDto  } from './game.dto';


export class GameController {
  constructor(private readonly GameService: GameService) {}

  @Get('/games')
  async getGames(@Query() getListDto: GetListDto) {
    return this.GameService.getGames(getListDto);
  }

  @Delete('/game/:id')
  @HttpCode(204)
  async deleteItem(@Param('id') id: number) {
    await this.GameService.deleteItem(id);
  }



  @Get('/game/:id')
  getItem(
    @Param('id') id: number
  ) {
    return this.GameService.getGame(
      id
    );
  }
}
