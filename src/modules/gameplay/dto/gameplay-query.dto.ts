export class GameplayQueryDto {
  location: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  page?: number;
  game?: number;
  mentor?: string;
  sort?: string;
  asc?: number;
}
