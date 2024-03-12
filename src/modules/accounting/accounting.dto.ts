export class CreateProductDto {
  name: string;
  unit: number;
}

export class CreateUnitDto {
  name: string;
}

export class CreateExpenseTypeDto {
  name: string;
}

export class CreateInvoiceDto {
  product: number;
  expenseType: number;
  quantity: number;
  totalExpense: number;
  date: string;
}
