import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { Consumer } from '../consumer/consumer.schema';
import {
  CheckInDto,
  LoginConsumerDto,
  RegisterConsumerDto,
  SaveGameplayResultDto,
} from './consumerApp.dto';
import { ConsumerAppService } from './consumerApp.service';
import { ConsumerProtected, ReqConsumer } from './consumerAuth.guard';

// The customer mobile app's routes.
@ApiTags('Consumer App')
@Controller('consumer-app')
export class ConsumerAppController {
  constructor(private readonly consumerAppService: ConsumerAppService) {}

  @Public()
  @Post('/register')
  register(@Body() dto: RegisterConsumerDto) {
    return this.consumerAppService.register(dto);
  }

  @Public()
  @Post('/login')
  login(@Body() dto: LoginConsumerDto) {
    return this.consumerAppService.login(dto);
  }

  @ConsumerProtected()
  @Get('/me')
  me(@ReqConsumer() consumer: Consumer) {
    return consumer;
  }

  @ConsumerProtected()
  @Post('/check-in')
  checkIn(@ReqConsumer() consumer: Consumer, @Body() dto: CheckInDto) {
    return this.consumerAppService.checkIn(consumer, dto);
  }

  @ConsumerProtected()
  @Get('/my-table')
  myTable(@ReqConsumer() consumer: Consumer) {
    return this.consumerAppService.myTable(consumer);
  }

  @ConsumerProtected()
  @Post('/results')
  saveResult(
    @ReqConsumer() consumer: Consumer,
    @Body() dto: SaveGameplayResultDto,
  ) {
    return this.consumerAppService.saveResult(consumer, dto);
  }

  @ConsumerProtected()
  @Get('/results')
  myResults(@ReqConsumer() consumer: Consumer) {
    return this.consumerAppService.myResults(consumer);
  }

  @ConsumerProtected()
  @Get('/stats')
  stats(@ReqConsumer() consumer: Consumer) {
    return this.consumerAppService.stats(consumer);
  }
}
