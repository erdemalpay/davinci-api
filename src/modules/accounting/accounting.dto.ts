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
  location: string;
  products?: string[];
}
export class CreateCountDto {
  user: string;
  location: string;
  status: boolean;
  products: CountProductDto[];
  date: string;
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
export class CreatePackageTypeDto {
  name: string;
  quantity: number;
}
export class CreateStockDto {
  product: string;
  location: string;
  quantity: number;
  packageType?: string;
}
export class CreateFixtureStockDto {
  fixture: string;
  location: string;
  quantity: number;
}
export class ConsumptStockDto {
  product: string;
  location: string;
  quantity: number;
}

export class CreateInvoiceDto {
  product: string;
  expenseType: string;
  quantity: number;
  totalExpense: number;
  location: string;
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
  location: string;
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
  location: string;
  date: string;
  vendor?: string;
  brand?: string;
  note?: string;
  packageType?: string;
}
