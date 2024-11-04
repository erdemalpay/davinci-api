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
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  AggregatedPlayerCountResponse,
  TableDto,
  TableResponse,
} from './table.dto';
import { TableService } from './table.service';

@ApiTags('Table')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Public()
  @ApiResponse({ type: [TableResponse] })
  @Get()
  getTables(@Query('location') location: number, @Query('date') date: string) {
    return this.tableService.getByLocation(location, date);
  }
  @Public()
  @Get('/yer_varmi')
  getYerVarmiTables(
    @Query('location') location: number,
    @Query('date') date: string,
  ) {
    return this.tableService.getYerVarmiByLocation(location, date);
  }

  @Public()
  @Get('/count')
  @ApiResponse({ type: AggregatedPlayerCountResponse })
  getTotalPlayerCount(
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.tableService.getTotalPlayerCountsByMonthAndYear(month, year);
  }
  @Post()
  @ApiResponse({ type: TableResponse })
  createTable(@ReqUser() user: User, @Body() tableDto: TableDto) {
    return this.tableService.create(user, tableDto);
  }

  @Patch('/close/:id')
  @ApiResponse({ type: TableResponse })
  closeTable(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() tableDto: TableDto,
  ) {
    return this.tableService.close(user, id, tableDto);
  }

  @Patch('/reopen/:id')
  @ApiResponse({ type: TableResponse })
  reopenTable(@ReqUser() user: User, @Param('id') id: number) {
    return this.tableService.reopen(user, id);
  }
  @Delete('/:id')
  @ApiResponse({ type: TableResponse })
  removeTable(@ReqUser() user: User, @Param('id') id: number) {
    return this.tableService.removeTableAndGameplays(user, id);
  }

  @Post('/:id/gameplay')
  @ApiResponse({ type: TableResponse })
  addGameplayToTable(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() gameplayDto: GameplayDto,
  ) {
    return this.tableService.addGameplay(user, id, gameplayDto);
  }

  @Delete('/:tableId/gameplay/:gameplayId')
  @ApiResponse({ type: TableResponse })
  removeGameplayFromTable(
    @ReqUser() user: User,
    @Param('tableId') tableId: number,
    @Param('gameplayId') gameplayId: number,
  ) {
    return this.tableService.removeGameplay(user, tableId, gameplayId);
  }
  @Patch('/:id')
  @ApiResponse({ type: TableResponse })
  updateTable(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() tableDto: TableDto,
  ) {
    return this.tableService.update(user, id, tableDto);
  }
}
