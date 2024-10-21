import { CountListsProduct } from './countList.schema';

export class CreateProductDto {
  name: string;
  expenseType: string[];
  brand?: string[];
  vendor?: string[];
  unitPrice?: number;
  matchedMenuItem?: number;
}

export class CreateServiceDto {
  name: string;
  expenseType: string[];
  vendor?: string[];
  brand?: string[];
  unitPrice?: number;
}

export class CreatePaymentDto {
  vendor: string;
  invoice?: number;
  serviceInvoice?: number;
  paymentMethod: string;
  date: string;
  location: string;
  amount: number;
}

export class CreateUnitDto {
  name: string;
}
export class StockQueryDto {
  after: string;
}

export class CreateStockLocationDto {
  name: string;
}

export class JoinProductDto {
  stayedProduct: string;
  removedProduct: string;
}

export class CreateBrandDto {
  name: string;
}

export class CreateVendorDto {
  name: string;
}

export class CreateCountListDto {
  name: string;
  products?: CountListsProduct[];
}

export class CreateCountDto {
  user: string;
  location: string;
  isCompleted: boolean;
  createdAt: Date;
  products: CountProductDto[];
  countList: string;
}

export class CountProductDto {
  product: string;
  stockQuantity: number;
  countQuantity: number;
}

export class CreateExpenseTypeDto {
  name: string;
  backgroundColor: string;
}

export class CreatePaymentMethodDto {
  name: string;
  isOnlineOrder?: boolean;
}

export class CreateStockDto {
  product: string;
  location: string | number;
  quantity: number;
  status: string;
}

export class CreateProductStockHistoryDto {
  product: string;
  location: string | number;
  change: number;
  currentAmount: number;
  status: string;
  user: string;
}

export class ConsumptStockDto {
  product: string;
  location: string;
  quantity: number;
  status?: string;
}

export class CreateInvoiceDto {
  product: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: string | number;
  date: string;
  brand?: string;
  vendor?: string;
  note?: string;
  isPaid: boolean;
  paymentMethod?: string;
  isStockIncrement?: boolean;
}

export class CreateServiceInvoiceDto {
  service: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: string | number;
  date: string;
  vendor?: string;
  brand?: string;
  note?: string;
  isPaid: boolean;
  paymentMethod?: string;
}

export enum StockHistoryStatusEnum {
  EXPENSEENTRY = 'EXPENSEENTRY',
  EXPENSEDELETE = 'EXPENSEDELETE',
  EXPENSEUPDATEDELETE = 'EXPENSEUPDATEDELETE',
  EXPENSEUPDATEENTRY = 'EXPENSEUPDATEENTRY',
  EXPENSETRANSFER = 'EXPENSETRANSFER',
  EXPENSEUPDATE = 'EXPENSEUPDATE',
  STOCKDELETE = 'STOCKDELETE',
  STOCKENTRY = 'STOCKENTRY',
  STOCKUPDATE = 'STOCKUPDATE',
  STOCKUPDATEDELETE = 'STOCKUPDATEDELETE',
  STOCKUPDATEENTRY = 'STOCKUPDATEENTRY',
  CONSUMPTION = 'CONSUMPTION',
  TRANSFERSERVICETOINVOICE = 'TRANSFERSERVICETOINVOICE',
  TRANSFERINVOICETOSERVICE = 'TRANSFERINVOICETOSERVICE',
  ORDERCANCEL = 'ORDERCANCEL',
  ORDERCREATE = 'ORDERCREATE',
  STOCKEQUALIZE = 'STOCKEQUALIZE',
  STOCKTRANSFER = 'STOCKTRANSFER',
}
