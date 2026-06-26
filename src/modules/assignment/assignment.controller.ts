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
  AssignmentQueryDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from './assignment.dto';
import { Assignment } from './assignment.schema';
import { AssignmentService } from './assignment.service';

@ApiTags('Assignment')
@Controller('assignments')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @ApiResponse({ type: Assignment })
  @Post()
  async create(@Body() createAssignmentDto: CreateAssignmentDto) {
    return this.assignmentService.createAssignment(createAssignmentDto);
  }

  @ApiResponse({ type: [Assignment] })
  @Get()
  async findAll(@Query() query: AssignmentQueryDto) {
    return this.assignmentService.getAllAssignments(query);
  }

  @ApiResponse({ type: Assignment })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.assignmentService.findById(id);
  }

  @ApiResponse({ type: Assignment })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAssignmentDto: UpdateAssignmentDto,
  ) {
    return this.assignmentService.updateAssignment(id, updateAssignmentDto);
  }

  @ApiResponse({ type: Assignment })
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.assignmentService.deleteAssignment(id);
  }
}