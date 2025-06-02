import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
import { lastValueFrom, timeout } from 'rxjs';
import { convertToHMS, convertToSeconds } from '../../utils/timeUtils';
import { User } from '../user/user.schema';
import { ButtonCallGateway } from './buttonCall.gateway';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { CreateButtonCallDto } from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';

@Injectable()
export class ButtonCallService {
  constructor(
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
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
        startHour: createButtonCallDto.hour,
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
      throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
    }

    closedButtonCall.set({
      duration: convertToHMS(
        convertToSeconds(closeButtonCallDto.hour) -
          convertToSeconds(closedButtonCall.startHour),
      ),
      finishHour: closeButtonCallDto.hour,
      cancelledBy: user._id,
    });
    closedButtonCall.save();
    console.log(
      'Button call cancelled successfully for ',
      closedButtonCall.tableName,
    );
    this.buttonCallGateway.emitButtonCallChanged(closedButtonCall);

    if (notifyCafe) {
      await this.notifyCafe(user, closeButtonCallDto);
    }

    return closedButtonCall;
  }

  async notifyCafe(user: User, closeButtonCallDto: CloseButtonCallDto) {
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (!this.buttonCallNeoIP || !this.buttonCallNeoPort) {
      throw new HttpException(
        'IP and PORT must be specified.',
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    const apiUrl =
      'http://' +
      this.buttonCallNeoIP +
      ':' +
      this.buttonCallNeoPort +
      '/transmit';
    try {
      const response = await lastValueFrom(
        this.httpService
          .post(
            apiUrl,
            {
              location: closeButtonCallDto.location,
              tableName: closeButtonCallDto.tableName,
            },
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )
          .pipe(timeout(10000)),
      );
    } catch (error) {
      throw new HttpException(
        error.message ?? 'Error notifying cafe',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async averageButtonCallStats(
    date: string,
    location: number,
  ): Promise<{
    averageDuration: string;
    longestCalls: { tableName: string; duration: string }[];
  }> {
    const calls = await this.buttonCallModel
      .find({
        date,
        location: Number(location),
        finishHour: { $exists: true },
      })
      .select('duration tableName')
      .exec();

    if (!calls.length) {
      return {
        averageDuration: '00:00:00',
        longestCalls: [],
      };
    }

    const callsWithSeconds = calls.map((call) => {
      const [h, m, s] = call.duration.split(':').map(Number);
      const seconds = h * 3600 + m * 60 + s;
      return { tableName: call.tableName, duration: call.duration, seconds };
    });

    const totalSeconds = callsWithSeconds.reduce(
      (sum, c) => sum + c.seconds,
      0,
    );
    const avgSeconds = Math.round(totalSeconds / callsWithSeconds.length);

    const hours = Math.floor(avgSeconds / 3600);
    const minutes = Math.floor((avgSeconds % 3600) / 60);
    const seconds = avgSeconds % 60;

    const averageDuration = [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].join(':');

    const longestCalls = callsWithSeconds
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 3)
      .map(({ tableName, duration }) => ({ tableName, duration }));

    return { averageDuration, longestCalls };
  }

  async find(month?: string, date?: string, location?: number, type?: string) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return null;
    }

    const query: any = {};

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 1);
      query.createdAt = { $gte: start, $lt: end };
    }

    if (date) {
      query.date = date;
    }

    if (location !== undefined) {
      query.location = location;
    }

    if (type) {
      query.finishHour = { $exists: !(type === 'active') };
    }

    return this.buttonCallModel.find(query);
  }
}
