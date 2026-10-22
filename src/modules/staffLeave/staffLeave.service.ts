import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { assertFound } from 'src/utils/serviceUtils';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateStaffLeaveDto,
  CreateStaffLeaveTypeDto,
  StaffLeaveQueryDto,
} from './staffLeave.dto';
import { StaffLeave, StaffLeaveType } from './staffLeave.schema';

@Injectable()
export class StaffLeaveService {
  constructor(
    @InjectModel(StaffLeaveType.name)
    private staffLeaveTypeModel: Model<StaffLeaveType>,
    @InjectModel(StaffLeave.name)
    private staffLeaveModel: Model<StaffLeave>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findTypes() {
    return this.staffLeaveTypeModel.find().sort({ _id: 1 }).lean();
  }

  async createType(dto: CreateStaffLeaveTypeDto) {
    const staffLeaveType = await this.staffLeaveTypeModel.create({
      ...dto,
      active: true,
    });
    this.websocketGateway.emitStaffLeaveChanged();
    return staffLeaveType;
  }

  async updateType(id: number, updates: UpdateQuery<StaffLeaveType>) {
    const staffLeaveType = await this.staffLeaveTypeModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    assertFound(staffLeaveType, 'Staff leave type not found');
    this.websocketGateway.emitStaffLeaveChanged();
    return staffLeaveType;
  }

  // Aralığın dışından başlayıp içine taşan kayıtlar da gelir.
  findAll({ after, before }: StaffLeaveQueryDto) {
    const filter: FilterQuery<StaffLeave> = {};
    if (before) filter.startDate = { $lte: before };
    if (after) filter.endDate = { $gte: after };
    return this.staffLeaveModel.find(filter).sort({ startDate: 1 }).lean();
  }

  async create(user: User, dto: CreateStaffLeaveDto) {
    if (dto.startDate > dto.endDate) {
      throw new HttpException(
        'Start date must not be after end date',
        HttpStatus.BAD_REQUEST,
      );
    }
    const staffLeave = await this.staffLeaveModel.create({
      ...dto,
      createdBy: user._id,
    });
    this.websocketGateway.emitStaffLeaveChanged();
    return staffLeave;
  }

  async update(id: number, updates: UpdateQuery<StaffLeave>) {
    const staffLeave = await this.staffLeaveModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    assertFound(staffLeave, 'Staff leave not found');
    this.websocketGateway.emitStaffLeaveChanged();
    return staffLeave;
  }

  async remove(id: number) {
    const staffLeave = await this.staffLeaveModel.findByIdAndDelete(id);
    assertFound(staffLeave, 'Staff leave not found');
    this.websocketGateway.emitStaffLeaveChanged();
    return staffLeave;
  }
}
