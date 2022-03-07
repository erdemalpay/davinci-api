import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { TableResponse } from './table.dto';
import { TableService } from './table.service';
import { JwtAuthGuard } from '../auth/auth.guards';

@ApiCookieAuth('jwt')
@ApiTags('Table')
@UseGuards(JwtAuthGuard)
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
