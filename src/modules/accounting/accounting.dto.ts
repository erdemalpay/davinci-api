import { CountListsProduct } from './countList.schema';
import { BaseQuantityByLocation, ProductShelfInfo } from './product.schema';

export class CreateProductDto {
  name: string;
  expenseType: string[];
  brand?: string[];
  vendor?: string[];
  unitPrice?: number;
  matchedMenuItem?: number;
  baseQuantities?: BaseQuantityByLocation[];
  shelfInfo?: ProductShelfInfo[];
}

export class CreateProductCategoryDto {
  name: string;
  ikasId?: string;
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
  location: number;
  amount: number;
}

export class CreateUnitDto {
  name: string;
}
export class StockQueryDto {
  after: string;
  location?: string;
  before?: string;
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
  location: number;
  isCompleted: boolean;
  createdAt: Date;
  products: CountProductDto[];
  countList: string;
}

export class CountProductDto {
  product: string;
  stockQuantity: number;
  countQuantity: number;
  productDeleteRequest?: string;
}

export class CreateExpenseTypeDto {
  name: string;
  backgroundColor: string;
}

export class CreatePaymentMethodDto {
  name: string;
  isOnlineOrder?: boolean;
  ikasId?: string;
  isPaymentMade?: boolean;
  isUsedAtExpense?: boolean;
}

export class CreateStockDto {
  product: string;
  location: number;
  quantity: number;
  status: string;
}

export class CreateProductStockHistoryDto {
  product: string;
  location: number;
  change: number;
  currentAmount: number;
  status: string;
  user: string;
}

export class ConsumptStockDto {
  product: string;
  location: number;
  quantity: number;
  status?: string;
}

export class CreateInvoiceDto {
  product: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: number;
  date: string;
  brand?: string;
  vendor?: string;
  note?: string;
  isPaid: boolean;
  paymentMethod?: string;
  isStockIncrement?: boolean;
}
export class CreateExpenseDto {
  product?: string;
  service?: string;
  expenseType?: string;
  quantity: number;
  totalExpense: number;
  date: string;
  brand?: string;
  vendor?: string;
  location: number;
  isPaid: boolean;
  paymentMethod?: string;
  note?: string;
  type: string;
  isStockIncrement?: boolean;
}
export class CreateMultipleExpenseDto {
  date: string;
  product: string;
  expenseType: string;
  location: string;
  brand?: string;
  vendor: string;
  paymentMethod: string;
  quantity: number;
  price: number;
  kdv: number;
  isStockIncrement: boolean;
  note?: string;
}
export enum ExpenseTypes {
  STOCKABLE = 'STOCKABLE',
  NONSTOCKABLE = 'NONSTOCKABLE',
}

export class CreateServiceInvoiceDto {
  service: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: number;
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
  LOSSPRODUCT = 'LOSSPRODUCT',
  ORDERRETURN = 'ORDERRETURN',
  IKASORDERCREATE = 'IKASORDERCREATE',
  LOSSPRODUCTCANCEL = 'LOSSPRODUCTCANCEL',
  CONSUMPTIONCANCEL = 'CONSUMPTIONCANCEL',
  IKASORDERCANCEL = 'IKASORDERCANCEL',
}

export type StockHistoryFilter = {
  product?: string[];
  expenseType?: string;
  location?: string;
  status?: string;
  before?: string;
  after?: string;
  sort?: string;
  asc?: number;
  vendor?: string;
  brand?: string;
};

export type InvoiceFilterType = {
  product?: string;
  expenseType?: string;
  brand?: string;
  vendor?: string;
  location?: string;
  before?: string;
  after?: string;
  sort?: string;
  asc?: number;
};

export type ExpenseWithPaginateFilterType = {
  product?: string;
  service?: string;
  type?: string;
  expenseType?: string;
  paymentMethod?: string;
  brand?: string;
  vendor?: string;
  location?: string;
  before?: string;
  after?: string;
  sort?: string;
  asc?: number;
  date?: string;
  search?: string;
};
export type ExpenseWithoutPaginateFilterType = {
  product?: string;
  service?: string;
  type?: string;
  expenseType?: string;
  paymentMethod?: string;
  brand?: string;
  vendor?: string;
  location?: string;
  before?: string;
  after?: string;
  sort?: string;
  asc?: number;
  date?: string;
  search?: string;
};

export class AddMultipleProductAndMenuItemDto {
  name: string;
  expenseType?: string;
  brand?: string;
  vendor?: string;
  category?: string;
  price?: number;
  onlinePrice?: number;
  description?: string;
  image?: string;
}
export class UpdateMultipleProduct {
  name: string;
  expenseType?: string;
  brand?: string;
  vendor?: string;
}
