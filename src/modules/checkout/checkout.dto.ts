export class CreateIncomeDto {
  location: string;
  date: string;
  amount: number;
}

export class CreateCashoutDto {
  location: string;
  date: string;
  amount: number;
  description: string;
}
