import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
import { convertToHMS, convertToSeconds } from '../../utils/timeUtils';
import { User } from '../user/user.schema';
import { ButtonCallGateway } from './buttonCall.gateway';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { CreateButtonCallDto } from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, timeout } from 'rxjs';

@Injectable()
export class ButtonCallService {
  constructor(
    @InjectModel(ButtonCall.name) private readonly buttonCallModel: Model<ButtonCall>,
    private readonly httpService: HttpService,
    private readonly buttonCallGateway: ButtonCallGateway,
  ) {}

  private readonly buttonCallNeoIP: string = process.env.BUTTON_CALL_NEO_IP;
  private readonly buttonCallNeoPort: string = process.env.BUTTON_CALL_NEO_PORT;

  async create(user: User, createButtonCallDto: CreateButtonCallDto) {
    const existingButtonCall = await this.buttonCallModel.findOne({
      tableName: createButtonCallDto.tableName,
      finishHour: { $exists: false },
    });
    if (existingButtonCall) {
      existingButtonCall.callCount += 1;
      existingButtonCall.save();
      return existingButtonCall;
    }

    try {
      const createdButtonCall = new this.buttonCallModel({
        ...createButtonCallDto,
        date: format(new Date(), 'yyyy-MM-dd'),
        startHour: format(new Date(), 'HH:mm:ss'),
        createdBy: user._id,
      });
      this.buttonCallGateway.emitButtonCallChanged(createdButtonCall);
      await createdButtonCall.save();
      return createdButtonCall;
    } catch (error) {
      throw new HttpException(
        'Failed to Create Button Call',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async close(
    user: User,
    closeButtonCallDto: CloseButtonCallDto,
    notifyCafe = false,
  ) {
    const closedButtonCall = await this.buttonCallModel.findOne({
      tableName: closeButtonCallDto.tableName,
      finishHour: { $exists: false },
    });
    if (!closedButtonCall) {
      console.log('There is no active button calls found for this button');
      throw new HttpException("Not Found", HttpStatus.NOT_FOUND);
    }

    const finishHour = format(new Date(), 'HH:mm:ss');
    closedButtonCall.set({
      duration: convertToHMS(
        convertToSeconds(finishHour) -
          convertToSeconds(closedButtonCall.startHour),
      ),
      finishHour: finishHour,
      cancelledBy: user._id,
    });
    closedButtonCall.save();
    console.log(
      'Button call cancelled successfully for ',
      closedButtonCall.tableName,
    );
    this.buttonCallGateway.emitButtonCallChanged(closedButtonCall);

    if(notifyCafe) {
      await this.notifyCafe(user, closedButtonCall);
    }

    return closedButtonCall;
  }

  async notifyCafe(user: User, closeButtonCallDto: CloseButtonCallDto) {
    if (!user)
    {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    if (!this.buttonCallNeoIP || !this.buttonCallNeoPort) {
      throw new HttpException('IP and PORT must be specified.', HttpStatus.PRECONDITION_REQUIRED);
    }
    const apiUrl = 'http://' + this.buttonCallNeoIP + ':' + this.buttonCallNeoPort + '/transmit';
    try {
      const response = await lastValueFrom(this.httpService
        .post(apiUrl, { 'location': closeButtonCallDto.location, 'tableName': closeButtonCallDto.tableName }, {
          headers: { 'Content-Type': 'application/json' },
        })
        .pipe(timeout(10000))
      );
    } catch (error) {
      throw new HttpException(error.message ?? 'Error notifying cafe', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async find(date?: string, location?: number, type?: string) {
    const query: any = {};
    if (date) query.date = date;
    if (location !== undefined) query.location = location;
    if (type) query.finishHour = { $exists: !(type === 'active') };

    return this.buttonCallModel.find(query);
  }
}
