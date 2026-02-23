import { Actions } from './disabledCondition.schema';
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
  page: string;
  actions: Actions[];
}

export class CreateActionDto {
  name: string;
}

export class CreateTaskTrackDto {
  task: string;
  users: string[];
  type: string[];
  createdAt: string;
}

export class ReleaseNoteItemDto {
  title?: string;
  description?: string;
}

export class CreateReleaseNoteDto {
  releaseId: string;
  title: string;
  date: string;
  items?: ReleaseNoteItemDto[];
  isPublished?: boolean;
}
