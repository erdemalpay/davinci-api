import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import * as xlsx from 'xlsx';
import { MenuService } from './../menu/menu.service';
import {
  CreateBrandDto,
  CreateExpenseTypeDto,
  CreateInvoiceDto,
  CreateProductDto,
  CreateStockDto,
  CreateStockTypeDto,
  CreateUnitDto,
  CreateVendorDto,
} from './accounting.dto';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Invoice } from './invoice.schema';
import { Product } from './product.schema';
import { Stock } from './stock.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

export class AccountingService {
  constructor(
    @InjectModel(Product.name)
    private productModel: Model<Product>,
    @InjectModel(Unit.name) private unitModel: Model<Unit>,
    @InjectModel(ExpenseType.name) private expenseTypeModel: Model<ExpenseType>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(StockType.name) private stockTypeModel: Model<StockType>,
    @InjectModel(Stock.name) private stockModel: Model<Stock>,
    private readonly MenuService: MenuService,
  ) {}
  //   Products
  findAllProducts() {
    return this.productModel.find().populate('unit stockType');
  }
  async createProduct(createProductDto: CreateProductDto) {
    try {
      const product = new this.productModel(createProductDto);
      product._id = usernamify(product.name);
      await product.save();

      // Optionally, return the created product or a success message
      return product;
    } catch (error) {
      console.error('Failed to create product:', error);
      throw new Error('Failed to create product');
    }
  }
  updateProduct(id: string, updates: UpdateQuery<Product>) {
    return this.productModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeProduct(id: string) {
    const invoices = await this.invoiceModel.find({ product: id });
    const menuItems = await this.MenuService.findAllItems();
    if (
      menuItems.some((item) =>
        item.itemProduction.some((itemProduct) => itemProduct.product === id),
      )
    ) {
      throw new Error('Cannot remove product with menu items');
    }
    if (invoices.length > 0) {
      throw new Error('Cannot remove product with invoices');
    }

    return this.productModel.findByIdAndRemove(id);
  }
  //   Units
  findAllUnits() {
    return this.unitModel.find();
  }
  async createUnit(createUnitDto: CreateUnitDto) {
    const unit = new this.unitModel(createUnitDto);
    unit._id = usernamify(unit.name);
    await unit.save();
  }
  updateUnit(id: string, updates: UpdateQuery<Unit>) {
    return this.unitModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeUnit(id: string) {
    const products = await this.productModel.find({ unit: id });
    if (products.length > 0) {
      throw new Error('Cannot remove unit with products');
    }
    return this.unitModel.findByIdAndRemove(id);
  }
  //   Expense Types
  findAllExpenseTypes() {
    return this.expenseTypeModel.find();
  }
  async createExpenseType(createExpenseTypeDto: CreateExpenseTypeDto) {
    const expenseType = new this.expenseTypeModel(createExpenseTypeDto);
    expenseType._id = usernamify(expenseType.name);
    await expenseType.save();
  }
  updateExpenseType(id: string, updates: UpdateQuery<ExpenseType>) {
    return this.expenseTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeExpenseType(id: string) {
    const invoices = await this.invoiceModel.find({ expenseType: id });
    if (invoices.length > 0) {
      throw new Error('Cannot remove expense type with invoices');
    }
    return this.expenseTypeModel.findByIdAndRemove(id);
  }
  //   Brands
  findAllBrands() {
    return this.brandModel.find();
  }
  async createBrand(createBrandDto: CreateBrandDto) {
    const brand = new this.brandModel(createBrandDto);
    brand._id = usernamify(brand.name);
    await brand.save();
  }
  updateBrand(id: string, updates: UpdateQuery<Brand>) {
    return this.brandModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeBrand(id: string) {
    const products = await this.productModel.find({
      brand: id,
    });
    if (products.length > 0) {
      throw new Error('Cannot remove brand with products');
    }
    return this.brandModel.findByIdAndRemove(id);
  }

  //   Vendors
  findAllVendors() {
    return this.vendorModel.find();
  }
  async createVendor(createVendorDto: CreateVendorDto) {
    const vendor = new this.vendorModel(createVendorDto);
    vendor._id = usernamify(vendor.name);
    await vendor.save();
  }
  updateVendor(id: string, updates: UpdateQuery<Vendor>) {
    return this.vendorModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeVendor(id: string) {
    const products = await this.productModel.find({
      vendor: id,
    });
    if (products.length > 0) {
      throw new Error('Cannot remove vendor with products');
    }
    return this.vendorModel.findByIdAndRemove(id);
  }

  // Invoices
  findAllInvoices() {
    return this.invoiceModel
      .find()
      .populate('product expenseType brand vendor')
      .sort({ date: -1 });
  }
  async createInvoice(createInvoiceDto: CreateInvoiceDto) {
    try {
      const ProductLastInvoice = await this.invoiceModel
        .find({ product: createInvoiceDto.product })
        .sort({ date: -1 })
        .limit(1);

      if (
        !ProductLastInvoice[0] ||
        ProductLastInvoice[0]?.date < createInvoiceDto.date
      ) {
        const updatedUnitPrice = parseFloat(
          (createInvoiceDto.totalExpense / createInvoiceDto.quantity).toFixed(
            2,
          ),
        );

        await this.productModel.findByIdAndUpdate(
          createInvoiceDto.product,
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );

        await this.stockModel.findOneAndUpdate(
          { product: createInvoiceDto.product },
          { $set: { unitPrice: updatedUnitPrice } },
          { new: true },
        );
      }

      return await this.invoiceModel.create(createInvoiceDto);
    } catch (error) {
      console.error('Failed to create invoice:', error);
      throw new Error('Invoice creation failed.');
    }
  }

  async updateInvoice(id: number, updates: UpdateQuery<Invoice>) {
    if (updates.quantity || updates.totalExpense) {
      const invoice = await this.invoiceModel.findById(id);
      const ProductLastInvoice = await this.invoiceModel
        .find({ product: invoice.product })
        .sort({ date: -1 })
        .limit(1);
      updates.unitPrice = updates.totalExpense / updates.quantity;
      if (ProductLastInvoice[0]._id == id) {
        await this.productModel.findByIdAndUpdate(
          invoice.product,
          { unitPrice: updates.unitPrice.toFixed(1) },
          {
            new: true,
          },
        );
        await this.stockModel.findOneAndUpdate(
          { product: invoice.product },
          { unitPrice: updates.unitPrice.toFixed(1) },
          {
            new: true,
          },
        );
      }
    }
    return this.invoiceModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeInvoice(id: number) {
    return this.invoiceModel.findByIdAndRemove(id);
  }
  // Stock Type
  findAllStockTypes() {
    return this.stockTypeModel.find();
  }
  async createStockType(createStockTypeDto: CreateStockTypeDto) {
    const stockType = new this.stockTypeModel(createStockTypeDto);
    stockType._id = usernamify(stockType.name);
    await stockType.save();
  }
  updateStockType(id: string, updates: UpdateQuery<StockType>) {
    return this.stockTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeStockType(id: string) {
    const stocks = await this.stockModel.find({ stockType: id });
    if (stocks.length > 0) {
      throw new Error('Cannot remove stock type with stocks');
    }
    return this.stockTypeModel.findByIdAndRemove(id);
  }
  // Stocks
  findAllStocks() {
    return this.stockModel.find().populate('product location');
  }

  async createStock(createStockDto: CreateStockDto) {
    const stock = new this.stockModel(createStockDto);
    stock._id = usernamify(createStockDto.product + createStockDto.location);
    if (
      stock.unitPrice === 0 ||
      stock.unitPrice === undefined ||
      stock.unitPrice === null
    ) {
      const product = await this.productModel.findById(createStockDto.product);
      stock.unitPrice = product?.unitPrice ?? 0;
    }
    await stock.save();
  }

  updateStock(id: string, updates: UpdateQuery<Stock>) {
    return this.stockModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeStock(id: string) {
    return this.stockModel.findByIdAndRemove(id);
  }

  // script
  readColumnFromExcel = (filePath: string, column: number) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(sheet['!ref']);
    let values = [];

    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
      const cellAddress = { c: column, r: rowNum };
      const cellRef = xlsx.utils.encode_cell(cellAddress);
      const cell = sheet[cellRef];
      values.push(cell?.v ?? '');
    }
    return values;
  };
  eliminateDuplicates = (arr) => [...new Set(arr)];

  runScriptUnit = async () => {
    try {
      const filePath = './src/assets/InvoiceNew.xlsx';
      const unitValues = this.readColumnFromExcel(filePath, 10);
      const uniqueUnitValues = this.eliminateDuplicates(unitValues);
      for (const unitValue of uniqueUnitValues) {
        const body = { name: unitValue as string };
        try {
          await this.createUnit(body);
        } catch (innerError) {
          console.error(
            `Error creating unit for ${unitValue}: ${innerError.message}`,
          );
        }
      }
    } catch (error) {
      console.error(`Error in runScriptUnit: ${error.message}`);
    }
  };
  runScriptExpenseType = async () => {
    try {
      const filePath = './src/assets/InvoiceNew.xlsx';
      const expenseTypeValues = this.readColumnFromExcel(filePath, 8);
      const uniqueValues = this.eliminateDuplicates(expenseTypeValues);
      for (const item of uniqueValues) {
        const body = { name: item as string, backgroundColor: '#FB6D48' };
        if (
          item === '' ||
          item === undefined ||
          item === null ||
          item === '?'
        ) {
          continue;
        }
        try {
          await this.createExpenseType(body);
        } catch (innerError) {
          console.error(`Error creating  for ${item}: ${innerError.message}`);
        }
      }
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  };
  runScriptVendor = async () => {
    try {
      const filePath = './src/assets/InvoiceNew.xlsx';
      const vendorValues = this.readColumnFromExcel(filePath, 5);
      const uniqueValues = this.eliminateDuplicates(vendorValues);
      for (const item of uniqueValues) {
        const body = { name: item as string };
        if (
          item === '' ||
          item === undefined ||
          item === null ||
          item === '?'
        ) {
          continue;
        }
        try {
          await this.createVendor(body);
        } catch (innerError) {
          console.error(`Error creating  for ${item}: ${innerError.message}`);
        }
      }
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  };
  runScriptBrand = async () => {
    try {
      const filePath = './src/assets/InvoiceNew.xlsx';
      const brandValues = this.readColumnFromExcel(filePath, 6);
      const uniqueValues = this.eliminateDuplicates(brandValues);
      for (const item of uniqueValues) {
        const body = { name: item as string };
        if (
          item === '' ||
          item === undefined ||
          item === null ||
          item === '?'
        ) {
          continue;
        }
        try {
          await this.createBrand(body);
        } catch (innerError) {
          console.error(`Error creating  for ${item}: ${innerError.message}`);
        }
      }
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  };
  runScriptProduct = async () => {
    try {
      const filePath = './src/assets/InvoiceNew.xlsx';
      const brandValues = this.readColumnFromExcel(filePath, 6);
      const vendorValues = this.readColumnFromExcel(filePath, 5);
      const expenseTypeValues = this.readColumnFromExcel(filePath, 8);
      const unitValues = this.readColumnFromExcel(filePath, 10);
      const productValues = this.readColumnFromExcel(filePath, 9);
      await this.createStockType({ name: 'Gen', backgroundColor: '#FB6D48' });
      for (var i = 91; i < productValues.length; i++) {
        if (productValues[i] === undefined) {
          continue;
        }
        const body = {
          name: productValues[i] as string,
          unit: usernamify(unitValues[i]) ?? '',
          brand: [usernamify(brandValues[i] ?? '')],
          vendor: [usernamify(vendorValues[i] ?? '')],
          expenseType: [usernamify(expenseTypeValues[i] ?? '')],
          stockType: 'gen',
        };
        if (
          productValues[i] === '' ||
          productValues[i] === undefined ||
          productValues[i] === null ||
          productValues[i] === '?'
        ) {
          continue;
        }
        try {
          await this.createProduct(body);
          console.log(`Successfully created : ${productValues[i]}`);
        } catch (innerError) {
          console.error(
            `Error creating  for ${productValues[i]}: ${innerError.message}`,
          );
        }
      }
      for (var i = 1; i < 91; i++) {
        if (productValues[i] === undefined) {
          continue;
        }
        const body = {
          name: productValues[i] as string,
          unit: usernamify(unitValues[i]) ?? '',
          brand: [usernamify(brandValues[i] ?? '')],
          vendor: [usernamify(vendorValues[i] ?? '')],
          expenseType: [usernamify(expenseTypeValues[i] ?? '')],
          stockType: 'gen',
        };
        if (
          productValues[i] === '' ||
          productValues[i] === undefined ||
          productValues[i] === null ||
          productValues[i] === '?'
        ) {
          continue;
        }
        try {
          await this.createProduct(body);
        } catch (innerError) {
          console.error(
            `Error creating  for ${productValues[i]}: ${innerError.message}`,
          );
        }
      }
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  };
  runScriptInvoice = async () => {
    const filePath = './src/assets/InvoiceNew.xlsx';
    const yearValues = this.readColumnFromExcel(filePath, 1);
    const monthValues = this.readColumnFromExcel(filePath, 2);
    const dayValues = this.readColumnFromExcel(filePath, 3);
    const documentNoValues = this.readColumnFromExcel(filePath, 4);
    const vendorValues = this.readColumnFromExcel(filePath, 5);
    const brandValues = this.readColumnFromExcel(filePath, 6);
    const expenseTypeValues = this.readColumnFromExcel(filePath, 8);
    const productValues = this.readColumnFromExcel(filePath, 9);
    const quantityValues = this.readColumnFromExcel(filePath, 14);
    const totalExpenseValues = this.readColumnFromExcel(filePath, 15);

    for (var i = 1; i < totalExpenseValues.length; i++) {
      const body = {
        product: usernamify(productValues[i]),
        brand: usernamify(brandValues[i]) ?? '',
        vendor: usernamify(vendorValues[i]) ?? '',
        expenseType: usernamify(expenseTypeValues[i] ?? ''),
        quantity: quantityValues[i],
        totalExpense: totalExpenseValues[i],
        documentNo: documentNoValues[i] ?? '',
        date: `${
          yearValues[i] && monthValues[i] && dayValues[i]
            ? `${yearValues[i]}-${monthValues[i]
                .toString()
                .padStart(2, '0')}-${dayValues[i].toString().padStart(2, '0')}`
            : ''
        }`,
      };
      try {
        await this.createInvoice(body);
      } catch (innerError) {
        console.error(
          `Error creating  for ${productValues[i]}: ${innerError.message}`,
        );
      }
    }
  };
  runScript = async () => {
    try {
      await this.runScriptUnit();
      await this.runScriptExpenseType();
      await this.runScriptVendor();
      await this.runScriptBrand();
      await this.runScriptProduct();
      await this.runScriptInvoice();
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  };

  async removeAll() {
    await this.brandModel.deleteMany({});
    await this.expenseTypeModel.deleteMany({});
    await this.invoiceModel.deleteMany({});
    await this.productModel.deleteMany({});
    await this.stockModel.deleteMany({});
    await this.stockTypeModel.deleteMany({});
    await this.unitModel.deleteMany({});
    await this.vendorModel.deleteMany({});
  }
}
