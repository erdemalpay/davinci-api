import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { TableResponse } from './table.dto';
import { TableService } from './table.service';
import { JwtAuthGuard } from '../auth/auth.guards';

@ApiCookieAuth('jwt')
@ApiTags('Table')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Get('/table')
  @ApiResponse({ type: TableResponse })
  getTable(@Request() req) {
    return req.user;
  }

  @ApiResponse({ type: [TableResponse] })
  @Get('/tables')
  getTables(@Query('location') location: number) {
    return this.tableService.getByLocation(location);
  }
}
