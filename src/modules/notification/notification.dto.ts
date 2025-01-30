export class CreateNotificationDto {
  message: string;
  type: string;
  createdBy?: string;
  selectedUsers?: string[];
  selectedRoles?: number[];
  selectedLocations?: number[];
  seenBy?: string[];
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
}
