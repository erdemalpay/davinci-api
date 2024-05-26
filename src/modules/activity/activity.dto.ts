import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { Stock } from '../accounting/stock.schema';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Table } from '../table/table.schema';

export class ActivityDto {
  @IsNumber()
  _id: number;

  @IsString()
  @ApiProperty()
  actor: string;
}

export enum ActivityType {
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  CREATE_TABLE = 'CREATE_TABLE',
  UPDATE_TABLE = 'UPDATE_TABLE',
  DELETE_TABLE = 'DELETE_TABLE',
  CREATE_GAMEPLAY = 'CREATE_GAMEPLAY',
  UPDATE_GAMEPLAY = 'UPDATE_GAMEPLAY',
  DELETE_GAMEPLAY = 'DELETE_GAMEPLAY',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CREATE_STOCK = 'CREATE_STOCK',
  DELETE_STOCK = 'DELETE_STOCK',
  UPDATE_STOCK = 'UPDATE_STOCK',
}

export type ActivityTypePayload = {
  [ActivityType.CHANGE_PASSWORD]: void;
  [ActivityType.CREATE_TABLE]: Table;
  [ActivityType.UPDATE_TABLE]: { currentTable: Table; newTable: Table };
  [ActivityType.DELETE_TABLE]: Table;
  [ActivityType.CREATE_GAMEPLAY]: { tableId: number; gameplay: Gameplay };
  [ActivityType.UPDATE_GAMEPLAY]: {
    currentGameplay: GameplayDto;
    newGameplay: GameplayDto;
  };
  [ActivityType.DELETE_GAMEPLAY]: Gameplay;
  [ActivityType.LOGIN]: void;
  [ActivityType.LOGOUT]: void;
  [ActivityType.CREATE_STOCK]: Stock;
  [ActivityType.DELETE_STOCK]: Stock;
  [ActivityType.UPDATE_STOCK]: { currentStock: Stock; newStock: Stock };
};
