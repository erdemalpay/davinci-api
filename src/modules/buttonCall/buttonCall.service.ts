import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
import { dateRanges } from '../../utils/dateRanges';
import { convertToHMS, convertToSeconds } from '../../utils/timeUtils';
import { UdpService } from '../udp/udp.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { ButtonCallGateway } from './buttonCall.gateway';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import { CreateButtonCallDto } from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { tableCodes } from './tableCodes.mapping';

@Injectable()
export class ButtonCallService {
  constructor(
    @InjectModel(ButtonCall.name)
    private buttonCallModel: Model<ButtonCall>,
    private readonly buttonCallGateway: ButtonCallGateway,
    private readonly userService: UserService,
    @Inject(forwardRef(() => UdpService))
    private readonly udpService: UdpService,
  ) {}

  async handleButtonAction(location: number, time: string, code: number) {
    const tableEntry = Object.entries(tableCodes).find(
      ([, value]) => value.call_code === code || value.cancel_code === code,
    );
    if (!tableEntry) {
      console.log('Button code not found');
      return;
    }

    const [tableName, { call_code }] = tableEntry;

    const user = await this.userService.findById('dv'); // TEMPORARY, WE SHOULD USE A USER FOR NODEMCU
    if (!user) {
      console.log(`User 'dv' does not exist`);
      return;
    }
    if (code == call_code) {
      const existingButtonCall = await this.buttonCallModel.findOne({
        tableName: tableName,
        finishHour: { $exists: false },
      });
      if (existingButtonCall) {
        console.log('There is already an active button call for ', tableName);
        return;
      }
      await this.create({
        location: location,
        date: dateRanges.today().before,
        tableName: tableName,
        startHour: time,
        createdBy: user._id,
      });
      console.log('Button call created successfully for ', tableName);
    } else {
      const closedButtonCall = await this.buttonCallModel.findOne({
        tableName: tableName,
        finishHour: { $exists: false },
      });
      if (!closedButtonCall) {
        console.log('There is no open button calls for ', tableName);
        return;
      }
      await this.close(user, {
        _id: closedButtonCall._id,
        finishHour: time,
      });
    }
  }
  async create(createButtonCallDto: CreateButtonCallDto) {
    try {
      const createdButtonCall = new this.buttonCallModel({
        ...createButtonCallDto,
      });
      this.buttonCallGateway.emitButtonCallChanged(createdButtonCall);
      return createdButtonCall.save();
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
    notifynodemcu = false,
  ) {
    if (!closeButtonCallDto.finishHour) {
      closeButtonCallDto.finishHour = format(new Date(), 'HH:mm:ss');
    }
    const closedButtonCall = await this.buttonCallModel.findOne({
      _id: closeButtonCallDto._id,
      finishHour: { $exists: false },
    });
    if (!closedButtonCall) {
      console.log('There is no active button calls found for this button');
      return;
    }

    closedButtonCall.set({
      duration: convertToHMS(
        convertToSeconds(closeButtonCallDto.finishHour) -
          convertToSeconds(closedButtonCall.startHour),
      ),
      cancelledBy: user._id,
      finishHour: closeButtonCallDto.finishHour,
    });
    closedButtonCall.save();
    console.log(
      'Button call cancelled successfully for ',
      closedButtonCall.tableName,
    );
    this.buttonCallGateway.emitButtonCallChanged(closedButtonCall);

    if (notifynodemcu) {
      const tableEntry = tableCodes[closedButtonCall.tableName];
      this.udpService.sendUdpPacket(1, tableEntry.cancel_code);
    }
    return closedButtonCall;
  }
  async findByDateAndLocation(date: string, location: number, isActive: boolean) {
    return this.buttonCallModel.find({ date: date, location: location, finishHour: { $exists: !isActive } });
  }
}
