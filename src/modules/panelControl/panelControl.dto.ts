import { PageTab } from './page.schema';

export class CreatePageDto {
  name: string;
  tabs?: PageTab[];
}
