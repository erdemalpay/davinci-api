export class CreateProductDto {
  name: string;
  unit: string;
  expenseType: string[];
  stockType: string;
  brand?: string[];
  vendor?: string[];
}

export class CreateUnitDto {
  name: string;
}
export class CreateStockTypeDto {
  name: string;
  backgroundColor: string;
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

export class CreateStockDto {
  product: string;
  location: number;
  quantity: number;
  unitPrice?: number;
}

export class CreateInvoiceDto {
  product: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  date: string;
  brand?: string;
  vendor?: string;
  documentNo?: string;
}
