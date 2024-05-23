import { CountListsProduct } from './countList.schema';
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
  packageType: string;
  stockQuantity: number;
  countQuantity: number;
}
export class CreateExpenseTypeDto {
  name: string;
  backgroundColor: string;
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
}
