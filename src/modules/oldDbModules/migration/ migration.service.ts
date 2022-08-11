import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';

import { OldUserService } from '../oldUser/user.service';
import { UserService } from '../../user/user.service';
import { TableService } from 'src/modules/table/table.service';
import { OldTableService } from '../oldTable/table.service';
import { GameService } from 'src/modules/game/game.service';
import { OldGameService } from '../oldGame/game.service';
import { GameplayService } from 'src/modules/gameplay/gameplay.service';
import { Gameplay } from '../oldGameplay/gameplay.schema';
import { VisitService } from 'src/modules/visit/visit.service';
import { OldVisitService } from '../oldVisit/visit.service';

@Injectable()
export class MigrationService {
  constructor(
    private readonly userService: UserService,
    private readonly oldUserService: OldUserService,

    private readonly visitService: VisitService,
    private readonly oldVisitService: OldVisitService,

    private readonly tableService: TableService,
    private readonly oldTableService: OldTableService,

    private readonly gameService: GameService,
    private readonly oldGameService: OldGameService,

    private readonly gameplayService: GameplayService,
  ) {}

  async migrateUsers() {
    const oldUsers = await this.oldUserService.getAll();
    const existingUsers = await this.userService.getAll(false);
    const existingUserIds = existingUsers.map((user) => user._id);
    oldUsers.forEach(async (oldUser) => {
      if (existingUserIds.includes(oldUser.username)) {
        console.log(`User ${oldUser.username} already exists. Skipping...`);
        return;
      }
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
    console.log(`${oldTables.length} tables will be migrated.`);
    for await (const oldTable of oldTables) {
      const tableCreationTime = oldTable._id.getTimestamp();
      const tableDate =
        oldTable.date || format(tableCreationTime, 'yyyy-MM-dd');
      const tableStartHour =
        oldTable.startHour || format(tableCreationTime, 'HH:mm');

      // Check if table already exists
      const existingTable = await this.tableService.findByQuery({
        name: oldTable.name,
        date: tableDate,
        startHour: tableStartHour,
      });

      if (existingTable) {
        console.log(`Table ${oldTable.name} from ${tableDate} already exists.`);
        continue;
      }

      // Fill missing finish hours
      oldTable.gameplays.forEach((gameplay, index) => {
        if (gameplay.finishHour) {
          return;
        }
        // Check if it is last item or not
        if (oldTable.gameplays.length === index + 1) {
          gameplay.finishHour = oldTable.finishHour || '23:59';
        } else {
          gameplay.finishHour =
            oldTable.gameplays[index + 1].startHour ||
            format(oldTable.gameplays[index + 1]._id.getTimestamp(), 'HH:mm');
        }
      });

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

      await this.tableService.create({
        name: oldTable.name,
        location: 1,
        playerCount: oldTable.playerCount,
        date: tableDate,
        startHour: tableStartHour,
        finishHour: oldTable.finishHour || '23:59',
        gameplays: gameplays.map((gameplay) => gameplay._id),
      });
      console.log(`Table ${oldTable.name} from ${tableDate} is migrated.`);
    }
  }

  async migrateGames() {
    const oldGames = await this.oldGameService.getAll();
    const existingGames = await this.gameService.getGames();
    const existingGameIds = existingGames.map((game) => game._id);
    for await (const oldGame of oldGames) {
      if (!existingGameIds.includes(oldGame._id)) {
        console.log(`Game not found. Adding now: ${oldGame.title}`);
        await this.gameService.addGame(oldGame._id);
      }
    }
  }

  async migrateVisits() {
    const oldVisits = await this.oldVisitService.getAll();
    // const existingUsers = await this.visitService.getAll(false);
    // const existingUserIds = existingUsers.map((user) => user._id);
    for await (const oldVisit of oldVisits) {
      const visitCreationTime = oldVisit._id.getTimestamp();
      const visitDate =
        oldVisit.date || format(visitCreationTime, 'yyyy-MM-dd');
      const visitStartHour =
        oldVisit.startHour || format(visitCreationTime, 'HH:mm');

      // Check if visit already exists
      const existingUser = await this.visitService.findOneByQuery({
        location: 1,
        date: visitDate,
        startHour: visitStartHour,
        user: oldVisit.user.username,
      });

      if (existingUser) {
        console.log(
          `Visit with user ${oldVisit.user.username} from ${visitDate} already exists.`,
        );
        continue;
      }
      await this.visitService.createManually({
        location: 1,
        date: visitDate,
        startHour: visitStartHour,
        finishHour: oldVisit.finishHour,
        user: oldVisit.user.username,
      });
      console.log(
        `Visit with user ${oldVisit.user.username} from ${visitDate} is migrated.`,
      );
    }
  }
}
