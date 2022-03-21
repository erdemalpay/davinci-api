import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CreateGameplayDto } from '../gameplay/dto/create-gameplay.dto';
import { TableResponse, TableDto } from './table.dto';
import { TableService } from './table.service';

@ApiTags('Table')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Public()
  @ApiResponse({ type: [TableResponse] })
  @Get('/all')
  getTables(@Query('location') location: number) {
    return this.tableService.getByLocation(location);
  }

  @Get('/:id')
  @ApiResponse({ type: TableResponse })
  getTable(@Param() id: number) {
    return this.tableService.findById(id);
  }

  @Post('/:id/gameplay')
  @ApiResponse({ type: TableResponse })
  addGameplayToTable(
    @Param('id') id: number,
    @Body() gameplayDto: CreateGameplayDto,
  ) {
    return this.tableService.addGameplay(id, gameplayDto);
  }

  @Post('/new')
  @ApiResponse({ type: TableResponse })
  createTable(@Body() tableDto: TableDto) {
    return this.tableService.create(tableDto);
  }
}
