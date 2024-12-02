export class CreateIncomeDto {
  location: number;
  date: string;
  amount: number;
}

export class CreateCashoutDto {
  location: number;
  date: string;
  amount: number;
  description: string;
}

export class CreateCheckoutControlDto {
  location: number;
  date: string;
  amount: number;
}

export type CheckoutFilterType = {
  user?: string;
  location?: string;
  date?: string;
};
