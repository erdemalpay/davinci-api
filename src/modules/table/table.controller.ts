import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TableResponse } from './table.dto';
import { TableService } from './table.service';

@ApiTags('Table')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Get('/:id')
  @ApiResponse({ type: TableResponse })
  getTable(@Param() id: number) {
    return this.tableService.findById(id);
  }

  @ApiResponse({ type: [TableResponse] })
  @Get('/all')
  getTables(@Query('location') location: number) {
    return this.tableService.getByLocation(location);
  }
}
