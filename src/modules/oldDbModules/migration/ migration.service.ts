import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';

import { OldUserService } from '../oldUser/user.service';
import { UserService } from '../../user/user.service';
import { TableService } from 'src/modules/table/table.service';
import { OldTableService } from '../oldTable/table.service';
import { GameService } from 'src/modules/game/game.service';
import { OldGameService } from '../oldGame/game.service';
import { GameplayService } from 'src/modules/gameplay/gameplay.service';
import { OldGameplayService } from '../oldGameplay/gameplay.service';
import { Gameplay } from '../oldGameplay/gameplay.schema';

@Injectable()
export class MigrationService {
  constructor(
    private readonly userService: UserService,
    private readonly oldUserService: OldUserService,

    private readonly tableService: TableService,
    private readonly oldTableService: OldTableService,

    private readonly gameService: GameService,
    private readonly oldGameService: OldGameService,

    private readonly gameplayService: GameplayService,
    private readonly oldGameplayService: OldGameplayService,
  ) {}

  async migrateUsers() {
    const oldUsers = await this.oldUserService.getAll();
    oldUsers.forEach(async (oldUser) => {
      await this.userService.create({
        name: oldUser.name,
        _id: oldUser.username,
        password: 'dvdv',
        active: oldUser.active,
      });
    });
  }

  async migrateTablesAndGameplays() {
    const oldTables = await this.oldTableService.getAll();
    for await (const oldTable of oldTables) {
      const gameplays = await Promise.all(
        oldTable.gameplays.map((oldGameplay: Gameplay) => {
          const creationTime = oldGameplay._id.getTimestamp();
          const date = format(creationTime, 'yyyy-MM-dd');
          const startHour = format(creationTime, 'HH:mm');
          return this.gameplayService.create({
            location: 1,
            playerCount: oldGameplay.playerCount,
            mentor: oldGameplay.mentor.username,
            date: oldGameplay.date || date,
            startHour: oldGameplay.startHour || startHour,
            finishHour: oldGameplay.finishHour,
            game: oldGameplay.game as unknown as number,
          });
        }),
      );
      const tableCreationTime = oldTable._id.getTimestamp();
      const tableDate = format(tableCreationTime, 'yyyy-MM-dd');
      const tableStartHour = format(tableCreationTime, 'HH:mm');
      await this.tableService.create({
        name: oldTable.name,
        location: 1,
        playerCount: oldTable.playerCount,
        date: oldTable.date || tableDate,
        startHour: oldTable.startHour || tableStartHour,
        finishHour: oldTable.finishHour,
        gameplays: gameplays.map((gameplay) => gameplay._id),
      });
    }
  }

  async migrateGames() {
    const oldGames = await this.oldGameService.getAll();
    oldGames.forEach(async (oldGame) => {
      await this.gameService.addGame(oldGame._id);
    });
  }
}
