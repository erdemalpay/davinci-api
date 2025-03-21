import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateEducationDto } from './education.dto';
import { Education } from './education.schema';
import { EducationService } from './education.service';

@Controller('education')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Get()
  findAllEducation() {
    return this.educationService.findAllEducation();
  }

  @Post()
  createEducation(
    @ReqUser() user: User,
    @Body() createEducationDto: CreateEducationDto,
  ) {
    return this.educationService.createEducation(user, createEducationDto);
  }

  @Patch('/:id')
  updateEducation(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Education>,
  ) {
    return this.educationService.updateEducation(user, id, updates);
  }

  @Delete('/:id')
  removeEducation(@ReqUser() user: User, @Param('id') id: number) {
    return this.educationService.removeEducation(user, id);
  }
}
