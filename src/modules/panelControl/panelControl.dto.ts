import { PageTab } from './page.schema';

export class CreatePageDto {
  name: string;
  tabs?: PageTab[];
  permissionRoles?: string[] = [];
}

export class CreateCheckoutCashDto {
  description?: string;
  amount: number;
  date: string;
  location: string;
}
