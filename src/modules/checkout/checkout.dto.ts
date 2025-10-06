export class CreateIncomeDto {
  location: number;
  date: string;
  amount: number;
  isAfterCount: boolean;
}

export class CreateCashoutDto {
  location: number;
  date: string;
  amount: number;
  description: string;
  isAfterCount: boolean;
}

export class CreateCheckoutControlDto {
  location: number;
  date: string;
  amount: number;
  baseQuantity?: number;
}

export type CheckoutFilterType = {
  user?: string;
  location?: string;
  date?: string;
  after?: string;
  before?: string;
};

export type CashoutDateFilter = {
  after: string;
  before?: string;
  date?: string;
};
export class IncomeQueryDto {
  page?: number | string;
  limit?: number | string;
  user?: string;
  date?: string;
  after?: string;
  before?: string;
  sort?: string;
  asc?: number | '1' | '0' | '-1';
}
