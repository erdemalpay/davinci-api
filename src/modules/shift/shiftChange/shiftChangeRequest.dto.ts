import { ShiftChangeStatus, ShiftChangeType } from './shiftChangeRequest.enums';

export class ShiftSnapshotDto {
  shiftId: number;
  day: string;
  startTime: string; // Vardiya başlangıç saati (örn: "09:00")
  endTime?: string; // Vardiya bitiş saati (örn: "17:00")
  location: number;
  chefUser?: string;
  userId: string; // Bu shift'e atanmış kullanıcı
}

export class CreateShiftChangeRequestDto {
  targetUserId: string; //bu gerekli olmayabilir
  requesterShift: ShiftSnapshotDto;
  targetShift: ShiftSnapshotDto;
  type: ShiftChangeType; // SWAP veya TRANSFER
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
