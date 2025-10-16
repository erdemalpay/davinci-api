import { PageTab } from './page.schema';

export class CreatePageDto {
  name: string;
  tabs?: PageTab[];
  permissionRoles?: string[] = [];
}
export class CreatePanelSettingsDto {
  _id: number;
  isHoliday: boolean;
  isVisitEntryDisabled: boolean;
}

export class CreateDisabledConditionDto {
  _id: string;
  name: string;
  permissionRoles: number[];
}
