import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { TableDto } from '../table/table.dto';

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
  CREATE_GAMEPLAY = 'CREATE_GAMEPLAY',
  UPDATE_GAMEPLAY = 'UPDATE_GAMEPLAY',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

export type ActivityTypePayload = {
  [ActivityType.CHANGE_PASSWORD]: void;
  [ActivityType.CREATE_TABLE]: TableDto;
  [ActivityType.UPDATE_TABLE]: { currentTable: TableDto; newTable: TableDto };
  [ActivityType.CREATE_GAMEPLAY]: GameplayDto;
  [ActivityType.UPDATE_GAMEPLAY]: {
    currentGameplay: GameplayDto;
    newGameplay: GameplayDto;
  };
  [ActivityType.LOGIN]: void;
};
