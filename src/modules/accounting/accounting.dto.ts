import { CountListsProduct } from './countList.schema';
import { CountListsFixture } from './fixtureCountList.schema';
import { PackageType } from './product.schema';

export class CreateProductDto {
  name: string;
  unit: string;
  expenseType: string[];
  brand?: string[];
  vendor?: string[];
  unitPrice?: number;
  packages?: PackageType[];
}

export class CreateFixtureDto {
  name: string;
  expenseType: string[];
  brand?: string[];
  vendor?: string[];
  unitPrice?: number;
  unit?: string;
  packages?: PackageType[];
}
export class CreateServiceDto {
  name: string;
  expenseType: string[];
  vendor?: string[];
  brand?: string[];
  unitPrice?: number;
  unit?: string;
  packages?: PackageType[];
}

export class CreatePaymentDto {
  vendor: string;
  invoice?: number;
  fixtureInvoice?: number;
  serviceInvoice?: number;
  paymentMethod: string;
  date: string;
  location: string;
  amount: number;
}
export class CreateUnitDto {
  name: string;
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
export class CreateFixtureCountListDto {
  name: string;
  fixtures?: CountListsFixture[];
}
export class CreateCountDto {
  user: string;
  location: string;
  isCompleted: boolean;
  createdAt: Date;
  products: CountProductDto[];
  countList: string;
}
export class CreateFixtureCountDto {
  user: string;
  location: string;
  isCompleted: boolean;
  createdAt: Date;
  fixtures: CountFixtureDto[];
  countList: string;
}
export class CountProductDto {
  product: string;
  packageType: string;
  stockQuantity: number;
  countQuantity: number;
}
export class CountFixtureDto {
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
export class CreatePackageTypeDto {
  name: string;
  unit: string;
  quantity: number;
}
export class CreateStockDto {
  product: string;
  location: string | number;
  quantity: number;
  packageType?: string;
  status: string;
}
export class CreateFixtureStockDto {
  fixture: string;
  location: string | number;
  quantity: number;
  status: string;
}
export class CreateProductStockHistoryDto {
  product: string;
  location: string | number;
  change: number;
  currentAmount: number;
  packageType?: string;
  status: string;
  user: string;
}
export class CreateFixtureStockHistoryDto {
  fixture: string;
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
  packageType: string;
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
  packageType?: string;
  note?: string;
  isPaid: boolean;
  paymentMethod?: string;
  isStockIncrement?: boolean;
}

export class CreateFixtureInvoiceDto {
  fixture: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: string | number;
  date: string;
  brand?: string;
  vendor?: string;
  note?: string;
  packageType?: string;
  isPaid: boolean;
  paymentMethod?: string;
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
  packageType?: string;
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
  TRANSFERFIXTURETOINVOICE = 'TRANSFERFIXTURETOINVOICE',
  TRANSFERFIXTURETOSERVICE = 'TRANSFERFIXTURETOSERVICE',
  TRANSFERINVOICETOFIXTURE = 'TRANSFERINVOICETOFIXTURE',
  TRANSFERINVOICETOSERVICE = 'TRANSFERINVOICETOSERVICE',
  ORDERCANCEL = 'ORDERCANCEL',
  ORDERCREATE = 'ORDERCREATE',
  STOCKEQUALIZE = 'STOCKEQUALIZE',
}
