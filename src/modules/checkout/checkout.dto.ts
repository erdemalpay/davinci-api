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
};

export type CashoutDateFilter = {
  after: string;
  before?: string;
  date?: string;
};
