export class CreateNotificationDto {
  message?: string;
  type: string;
  createdBy?: string;
  selectedUsers?: string[];
  selectedRoles?: number[];
  selectedLocations?: number[];
  seenBy?: string[];
  event?: string;
  isAssigned?: boolean;
}

export enum NotificationType {
  INFORMATION = 'INFORMATION',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  ORDER = 'ORDER',
}

export class NotificationQueryDto {
  after?: string;
  before?: string;
  type?: string;
  event?: string;
}

export enum NotificationEventType {
  COMPLETECOUNT = 'COMPLETECOUNT',
  NEGATIVESTOCK = 'NEGATIVESTOCK',
  ZEROSTOCK = 'ZEROSTOCK',
  LOSSPRODUCT = 'LOSSPRODUCT',
  IKASTAKEAWAY = 'IKASTAKEAWAY',
  LATESHIFTSTART = 'LATESHIFTSTART',
  FARMBURGERACTIVATED = 'FARMBURGERACTIVATED',
  FARMBURGERDEACTIVATED = 'FARMBURGERDEACTIVATED',
  FARMNOTCONFIRMED = 'FARMNOTCONFIRMED',
  NIGHTOPENTABLE = 'NIGHTOPENTABLE',
  EARLYSHIFTEND = 'EARLYSHIFTEND',
}
