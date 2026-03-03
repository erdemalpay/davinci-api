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
  CreateMiddlemanDto,
  MiddlemanQueryDto,
  UpdateMiddlemanDto,
} from './middleman.dto';
import { Middleman } from './middleman.schema';
import { MiddlemanService } from './middleman.service';

@ApiTags('Middleman')
@Controller('middlemen')
export class MiddlemanController {
  constructor(private readonly middlemanService: MiddlemanService) {}

  @ApiResponse({ type: Middleman })
  @Post()
  async create(@Body() createMiddlemanDto: CreateMiddlemanDto) {
    return this.middlemanService.create(createMiddlemanDto);
  }

  @ApiResponse({ type: [Middleman] })
  @Get()
  async findAll(@Query() query: MiddlemanQueryDto) {
    return this.middlemanService.findAll(query);
  }

  @ApiResponse({ type: [Middleman] })
  @Get('location/:location')
  async findByLocation(@Param('location') location: number) {
    return this.middlemanService.findByLocation(location);
  }

  @ApiResponse({ type: [Middleman] })
  @Get('date/:date')
  async findByDate(@Param('date') date: string) {
    return this.middlemanService.findByDate(date);
  }

  @ApiResponse({ type: Middleman })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.middlemanService.findById(id);
  }

  @ApiResponse({ type: Middleman })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMiddlemanDto: UpdateMiddlemanDto,
  ) {
    return this.middlemanService.update(id, updateMiddlemanDto);
  }

  @ApiResponse({ type: Middleman })
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.middlemanService.delete(id);
  }
}
