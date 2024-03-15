export class CreateProductDto {
  name: string;
  unit: number;
  expenseType: number[];
  brand?: number[];
  vendor?: number[];
}

export class CreateUnitDto {
  name: string;
}
export class CreateStockTypeDto {
  name: string;
}
export class CreateBrandDto {
  name: string;
}
export class CreateVendorDto {
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
  brand?: number;
  vendor?: number;
  documentNo?: string;
}
