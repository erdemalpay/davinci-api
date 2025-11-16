export enum PointHistoryStatusEnum {
  POINTCREATE = 'POINTCREATE',
  POINTUPDATE = 'POINTUPDATE',
  POINTDELETE = 'POINTDELETE',
  COLLECTIONCREATED = 'COLLECTIONCREATED',
  COLLECTIONCANCELLED = 'COLLECTIONCANCELLED',
}

export class CreatePointDto {
  user: string;
  amount: number;
}

export class UpdatePointDto {
  amount?: number;
}

export class CreatePointHistoryDto {
  point: number;
  pointUser: string;
  createdBy: string;
  collectionId?: number;
  tableId?: number;
  status: PointHistoryStatusEnum;
  currentAmount: number;
  change: number;
}

export class PointHistoryFilter {
  pointUser?: string;
  status?: string;
  before?: string;
  after?: string;
  sort?: string;
  asc?: number | '1' | '0' | '-1';
}
