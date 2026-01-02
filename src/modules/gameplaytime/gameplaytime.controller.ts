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
import {
  CreateGameplayTimeDto,
  GameplayTimeQueryDto,
  UpdateGameplayTimeDto,
} from './gameplaytime.dto';
import { GameplayTime } from './gameplaytime.schema';
import { GameplayTimeService } from './gameplaytime.service';

@ApiTags('GameplayTime')
@Controller('gameplaytime')
export class GameplayTimeController {
  constructor(private readonly gameplayTimeService: GameplayTimeService) {}

  @ApiResponse({ type: GameplayTime })
  @Post()
  async create(@Body() createGameplayTimeDto: CreateGameplayTimeDto) {
    return this.gameplayTimeService.create(createGameplayTimeDto);
  }

  @ApiResponse({ type: [GameplayTime] })
  @Get()
  async findAll(@Query() query: GameplayTimeQueryDto) {
    return this.gameplayTimeService.findAll(query);
  }

  @ApiResponse({ type: GameplayTime })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.gameplayTimeService.findById(id);
  }

  @ApiResponse({ type: [GameplayTime] })
  @Get('location/:location')
  async findByLocation(@Param('location') location: number) {
    return this.gameplayTimeService.findByLocation(location);
  }

  @ApiResponse({ type: [GameplayTime] })
  @Get('date/:date')
  async findByDate(@Param('date') date: string) {
    return this.gameplayTimeService.findByDate(date);
  }

  @ApiResponse({ type: GameplayTime })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateGameplayTimeDto: UpdateGameplayTimeDto,
  ) {
    return this.gameplayTimeService.update(id, updateGameplayTimeDto);
  }

  @ApiResponse({ type: GameplayTime })
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.gameplayTimeService.delete(id);
  }
}
