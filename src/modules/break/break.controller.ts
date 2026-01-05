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
import { BreakQueryDto, CreateBreakDto, UpdateBreakDto } from './break.dto';
import { Break } from './break.schema';
import { BreakService } from './break.service';

@ApiTags('Break')
@Controller('breaks')
export class BreakController {
  constructor(private readonly breakService: BreakService) {}

  @ApiResponse({ type: Break })
  @Post()
  async create(@Body() createBreakDto: CreateBreakDto) {
    return this.breakService.create(createBreakDto);
  }

  @ApiResponse({ type: [Break] })
  @Get()
  async findAll(@Query() query: BreakQueryDto) {
    return this.breakService.findAll(query);
  }

  @ApiResponse({ type: Break })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.breakService.findById(id);
  }

  @ApiResponse({ type: [Break] })
  @Get('location/:location')
  async findByLocation(@Param('location') location: number) {
    return this.breakService.findByLocation(location);
  }

  @ApiResponse({ type: [Break] })
  @Get('date/:date')
  async findByDate(@Param('date') date: string) {
    return this.breakService.findByDate(date);
  }

  @ApiResponse({ type: Break })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBreakDto: UpdateBreakDto,
  ) {
    return this.breakService.update(id, updateBreakDto);
  }

  @ApiResponse({ type: Break })
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.breakService.delete(id);
  }
}
