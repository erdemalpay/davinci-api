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
  ConsumerQueryDto,
  CreateConsumerDto,
  UpdateConsumerDto,
} from './consumer.dto';
import { Consumer } from './consumer.schema';
import { ConsumerService } from './consumer.service';

@ApiTags('Consumer')
@Controller('consumers')
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  @ApiResponse({ type: Consumer })
  @Post()
  async create(@Body() createConsumerDto: CreateConsumerDto) {
    return this.consumerService.create(createConsumerDto);
  }

  @ApiResponse({ type: [Consumer] })
  @Get('full-names')
  async findAllActiveConsumers() {
    return this.consumerService.findAllActiveConsumers();
  }

  @ApiResponse({ type: [Consumer] })
  @Get()
  async findAll(@Query() query: ConsumerQueryDto) {
    return this.consumerService.findAll(query);
  }

  @ApiResponse({ type: Consumer })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.consumerService.findById(id);
  }

  @ApiResponse({ type: Consumer })
  @Get('email/:email')
  async findByEmail(@Param('email') email: string) {
    return this.consumerService.findByEmail(email);
  }

  @ApiResponse({ type: Consumer })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateConsumerDto: UpdateConsumerDto,
  ) {
    return this.consumerService.update(id, updateConsumerDto);
  }

  @ApiResponse({ type: Consumer })
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.consumerService.delete(id);
  }
}
