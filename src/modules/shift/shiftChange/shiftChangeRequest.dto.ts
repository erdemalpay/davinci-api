import { ShiftChangeStatus, ShiftChangeType } from './shiftChangeRequest.enums';

export class ShiftSnapshotDto {
  shiftId: number;
  day: string;
  startTime: string;
  endTime?: string;
  location: number;
  userId: string;
}

export class CreateShiftChangeRequestDto {
  targetUserId: string;
  requesterShift: ShiftSnapshotDto;
  targetShift: ShiftSnapshotDto;
  type: ShiftChangeType;
  requesterNote: string;
}

export class UpdateShiftChangeRequestDto {
  managerNote?: string;
}

export class ShiftChangeRequestFilterDto {
  status?: ShiftChangeStatus;
  requesterId?: string;
  targetUserId?: string;
  after?: string;
  before?: string;
  page?: number;
  limit?: number;
}
