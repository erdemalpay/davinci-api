import { ButtonCall } from './schemas/buttonCall.schema';
import { ButtonCallService} from './buttonCall.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ReqUser } from '../user/user.decorator';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { User } from '../user/user.schema';

@ApiTags('ButtonCall')
@Controller('button-calls')
export class ButtonCallController {
  constructor(private readonly buttonCallService: ButtonCallService) {}

  @ApiResponse({ type: [ButtonCall] })
  @Get()
  getButtonCalls(@Query('date') date: string,
                 @Query('location') location: number,
                 @Query('isActive') isActive: boolean) {
    return this.buttonCallService.findByDateAndLocation(date, location, isActive);
  }
  @ApiResponse({ type: ButtonCall })
  @Patch()
  closeTable(
    @ReqUser() user: User, /// UPDATE THIS!!! GET JUST $ID LIKE */$ID
    @Body() closeButtonCallDto: CloseButtonCallDto,
  ) {
    return this.buttonCallService.close(user, closeButtonCallDto, true);
  }
}
