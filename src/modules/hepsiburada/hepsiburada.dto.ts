export class BaseAttributeDto {
  name: string;
  value: string;
  mandatory: boolean;
}

export class HepsiburadaProductDto {
  merchantSku: string;
  barcode: string;
  hbSku: string;
  variantGroupId: string;
  productName: string;
  brand: string;
  images: string[];
  categoryId: number;
  categoryName: string;
  tax: string;
  price: string;
  description: string;
  status: string;
  baseAttributes: BaseAttributeDto[];
  variantTypeAttributes: any[];
  productAttributes: any[];
  validationResults: any[];
  rejectReasons: any[];
  qualityScore: number | null;
  qualityStatus: string | null;
  ccValidationResults: any | null;
}

export class GetAllProductsResponseDto {
  success: boolean;
  totalProducts: number;
  products: HepsiburadaProductDto[];
}
