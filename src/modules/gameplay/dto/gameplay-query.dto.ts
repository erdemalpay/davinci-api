export type FieldGrouping = 'mentor' | 'game';

export class GameplayQueryDto {
  location: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  page?: number;
  game?: number;
  mentor?: string;
  groupBy?: FieldGrouping[];
  sort?: string;
  asc?: number;
}
export class GameplayQueryGroupDto {
  location: string;
  startDate?: string;
  endDate?: string;
  groupBy?: FieldGrouping[];
}
