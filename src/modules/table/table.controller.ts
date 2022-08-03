import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Delete,
  Patch,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { TableResponse, TableDto } from './table.dto';
import { TableService } from './table.service';

@ApiTags('Table')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Public()
  @ApiResponse({ type: [TableResponse] })
  @Get('/all')
  getTables(@Query('location') location: number, @Query('date') date: string) {
    return this.tableService.getByLocation(location, date);
  }

  @Get('/:id')
  @ApiResponse({ type: TableResponse })
  getTable(@Param() id: number) {
    return this.tableService.findById(id);
  }

  @Delete('/:id')
  @ApiResponse({ type: TableResponse })
  removeTable(@Param('id') id: number) {
    return this.tableService.removeTableAndGameplays(id);
  }

  @Post('/:id/gameplay')
  @ApiResponse({ type: TableResponse })
  addGameplayToTable(
    @Param('id') id: number,
    @Body() gameplayDto: GameplayDto,
  ) {
    return this.tableService.addGameplay(id, gameplayDto);
  }

  @Delete('/:tableId/gameplay/:gameplayId')
  @ApiResponse({ type: TableResponse })
  removeGameplayFromTable(
    @Param('tableId') tableId: number,
    @Param('gameplayId') gameplayId: number,
  ) {
    return this.tableService.removeGameplay(tableId, gameplayId);
  }

  @Post('/new')
  @ApiResponse({ type: TableResponse })
  createTable(@Body() tableDto: TableDto) {
    return this.tableService.create(tableDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: TableResponse })
  updateTable(@Param('id') id: number, @Body() tableDto: TableDto) {
    return this.tableService.update(id, tableDto);
  }

  @Patch('/close/:id')
  @ApiResponse({ type: TableResponse })
  closeTable(@Param('id') id: number) {
    return this.tableService.close(id);
  }
}
