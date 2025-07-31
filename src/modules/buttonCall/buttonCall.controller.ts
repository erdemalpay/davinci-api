import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { ButtonCallService } from './buttonCall.service';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { CreateButtonCallDto } from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
@ApiTags('ButtonCall')
@Controller('button-calls')
export class ButtonCallController {
  constructor(private readonly buttonCallService: ButtonCallService) {}

  @ApiResponse({ type: [ButtonCall] })
  @Get()
  getButtonCalls(
    @Query('date') date: string,
    @Query('location') location: number,
    @Query('type') type: string,
  ) {
    return this.buttonCallService.find(date, location, type);
  }

  @Public()
  @ApiResponse({ type: ButtonCall })
  @Post()
  createButtonCall(
    @Body() createButtonCallDto: CreateButtonCallDto,
    @ReqUser() user?: User,
  ) {
    if (!createButtonCallDto.tableName || !createButtonCallDto.location) {
      throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    }
    return this.buttonCallService.create(createButtonCallDto, user);
  }

  @ApiResponse({ type: ButtonCall })
  @Patch()
  closeButtonCall(
    @ReqUser() user: User,
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    return this.buttonCallService.close(user, closeButtonCallDto);
  }

  @Delete('/:id')
  deleteButtonCall(@Param('id') id: number) {
    return this.buttonCallService.remove(id);
  }

  @ApiResponse({ type: ButtonCall })
  @Post('close-from-panel')
  closeButtonCallFromPanel(
    @ReqUser() user: User,
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    if (!closeButtonCallDto.tableName || !closeButtonCallDto.location) {
      throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    }
    return this.buttonCallService.close(user, closeButtonCallDto, true);
  }

  @Get('/average-duration')
  averageDuration(
    @Query('date') date: string,
    @Query('location') location: number,
  ) {
    return this.buttonCallService.averageButtonCallStats(date, location);
  }

  @ApiResponse({ type: ButtonCall })
  @Post('notify-cafe')
  notifyCafe(
    @ReqUser() user: User,
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    if (!closeButtonCallDto.tableName || !closeButtonCallDto.location) {
      throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    }
    return this.buttonCallService.notifyCafe(user, closeButtonCallDto);
  }
}
