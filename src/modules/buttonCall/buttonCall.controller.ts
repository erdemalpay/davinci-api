import { ButtonCall } from './schemas/buttonCall.schema';
import { ButtonCallService} from './buttonCall.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpException, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ReqUser } from '../user/user.decorator';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { User } from '../user/user.schema';
import { CreateButtonCallDto } from './dto/create-buttonCall.dto';

@ApiTags('ButtonCall')
@Controller('button-calls')
export class ButtonCallController {
  constructor(private readonly buttonCallService: ButtonCallService) {}

  @ApiResponse({ type: [ButtonCall] })
  @Get()
  getButtonCalls(@Query('date') date: string,
                 @Query('location') location: number,
                 @Query('type') type: string) {
    return this.buttonCallService.find(date, location, type);
  }

  @ApiResponse({ type: ButtonCall })
  @Post()
  createButtonCall(
      @ReqUser() user: User,
      @Body() createButtonCallDto: CreateButtonCallDto) {
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
    if (!closeButtonCallDto.tableName || !closeButtonCallDto.location) {
      throw new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    }
    return this.buttonCallService.close(user, closeButtonCallDto, true);
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