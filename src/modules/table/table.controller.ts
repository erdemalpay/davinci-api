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
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateOrderDto } from './../order/order.dto';
import { Feedback } from './feedback.schema';
import {
  AggregatedPlayerCountResponse,
  CreateFeedbackDto,
  TableDto,
  TableResponse,
} from './table.dto';
import { TableService } from './table.service';

@ApiTags('Table')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  // feedbacks
  @Get('/feedback')
  findQueryFeedbacks(
    @Query('after') after: string,
    @Query('before') before?: string,
    @Query('location') location?: number,
  ) {
    return this.tableService.findQueryFeedback(after, before, location);
  }
  @Public()
  @Post('/feedback')
  createFeedback(@Body() data: CreateFeedbackDto) {
    return this.tableService.createFeedback(data);
  }

  @Patch('/feedback/:id')
  updateFeedback(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Feedback>,
  ) {
    return this.tableService.updateFeedback(id, updates);
  }

  @Delete('/feedback/:id')
  deleteFeedback(@Param('id') id: number) {
    return this.tableService.removeFeedback(id);
  }

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
  createTable(
    @ReqUser() user: User,
    @Body()
    payload: {
      tableDto: TableDto;
      orders?: CreateOrderDto[];
    },
  ) {
    return this.tableService.create(user, payload.tableDto, payload.orders);
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

  @Get('/create_count')
  getAfterGivenDateCreatedNumbers(
    @Query('after') after: string,
    @Query('before') before?: string,
  ) {
    return this.tableService.getAfterGivenDateCreatedNumbers(after, before);
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

  @Get('/:id')
  @ApiResponse({ type: TableResponse })
  getTableById(@Param('id') id: number) {
    return this.tableService.getTableById(id);
  }
}
