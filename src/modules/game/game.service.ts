/* const bgg = require('../libs/bgg');
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Game } from './game.schema';
import { GameRepository } from './game.repository';


@Injectable()
export class GameService{
	constructor(
		private gameRepository: GameRepository,
	){}

	getGames(getListDto: GetListDto) {
    return this.GameRepository.getGames(getListDto);
  }

	getGameById(gameId: number) {
    return this.GameRepository.getGame(gameId);
  }

	async deleteGame(gameId: number) {
    const $game = await this.getGameById(gameId);
    await this.GameRepository.deleteGame(gameId);
  }


}
const addGame = async id => {
	const gameDetails = await bgg.getGameDetails(id);
	const game = new Game(gameDetails);
	await game.save();
	return true;
};

module.exports = {
	addGame
};
 */