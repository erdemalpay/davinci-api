import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
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
    @Query('month') month: string,
    @Query('date') date: string,
    @Query('location') location: number,
    @Query('type') type: string,
  ) {
    return this.buttonCallService.find(month, date, location, type);
  }

  @ApiResponse({ type: ButtonCall })
  @Post()
  createButtonCall(
    @ReqUser() user: User,
    @Body() createButtonCallDto: CreateButtonCallDto,
  ) {
    if (!createButtonCallDto.tableName || !createButtonCallDto.location) {
      throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    }
    return this.buttonCallService.create(user, createButtonCallDto);
  }

  @ApiResponse({ type: ButtonCall })
  @Patch()
  closeButtonCall(
    @ReqUser() user: User,
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    return this.buttonCallService.close(user, closeButtonCallDto);
  }

  @ApiResponse({ type: ButtonCall })
  @Post('close-from-panel')
  closeButtonCallFromPanel(
    @ReqUser() user: User,
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    if (!closeButtonCallDto.tableName || !closeButtonCallDto.location || !closeButtonCallDto.hour) {
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
