export class CreateProductDto {
  name: string;
  unit: number;
  expenseType: number[];
}

export class CreateUnitDto {
  name: string;
}

export class CreateExpenseTypeDto {
  name: string;
  backgroundColor: string;
}

export class CreateInvoiceDto {
  product: number;
  expenseType: number;
  quantity: number;
  totalExpense: number;
  date: string;
  brand?: string;
  company?: string;
  documentNo?: string;
}
