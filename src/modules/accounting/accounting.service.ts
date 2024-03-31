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

const path = require('path');

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
  async createProductForScript(createProductDto: CreateProductDto) {
    const foundProduct = await this.productModel.findOne({
      name: createProductDto.name,
    });
    if (foundProduct) {
      const updatedBrand = [
        ...new Set(
          [...foundProduct.brand, ...createProductDto.brand].filter(
            (item) => item !== '',
          ),
        ),
      ];
      const updatedVendor = [
        ...new Set(
          [...foundProduct.vendor, ...createProductDto.vendor].filter(
            (item) => item !== '',
          ),
        ),
      ];
      const updatedExpenseType = [
        ...new Set(
          [...foundProduct.expenseType, ...createProductDto.expenseType].filter(
            (item) => item !== '',
          ),
        ),
      ];
      await this.productModel.findByIdAndUpdate(
        foundProduct._id,
        {
          brand: updatedBrand,
          vendor: updatedVendor,
          expenseType: updatedExpenseType,
        },
        {
          new: true,
        },
      );
    } else {
      try {
        const product = new this.productModel(createProductDto);
        product._id = usernamify(product.name);
        await product.save();
      } catch (error) {
        console.error('Failed to create product:', error);
        throw new Error('Failed to create product');
      }
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
      .populate('product expenseType brand vendor location')
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
      if (!invoice) {
        throw new Error('Invoice not found');
      }
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
  async removeInvoice(id: number) {
    const invoice = await this.invoiceModel.findById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const ProductLastInvoice = await this.invoiceModel
      .find({ product: invoice.product })
      .sort({ date: -1 });

    if (ProductLastInvoice[0]?._id == id) {
      await this.productModel.findByIdAndUpdate(
        invoice.product,
        {
          unitPrice:
            (
              ProductLastInvoice[1]?.totalExpense /
              ProductLastInvoice[1]?.quantity
            ).toFixed(2) ?? 0,
        },
        {
          new: true,
        },
      );
    }
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
  eliminateDuplicates = function eliminateDuplicates(strings: string[]) {
    const unique = {};
    strings.forEach((str) => {
      const username = usernamify(str);
      if (!unique.hasOwnProperty(username)) {
        unique[username] = str;
      }
    });
    return Object.values(unique);
  };

  async runScript() {
    try {
      // const filePath = './src/assets/InvoiceNew.xlsx';
      const filePath = path.join(
        __dirname,
        '..',
        '..',
        'assets',
        'InvoiceNew.xlsx',
      );
      const [
        yearValues,
        monthValues,
        dayValues,
        documentNoValues,
        vendorValues,
        brandValues,
        locationValues,
        expenseTypeValues,
        productValues,
        unitValues,
        quantityValues,
        totalExpenseValues,
      ] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15].map((column) =>
        this.readColumnFromExcel(filePath, column),
      );

      const uniqueUnits = this.eliminateDuplicates(unitValues);
      const uniqueExpenseTypes = this.eliminateDuplicates(expenseTypeValues);
      const uniqueVendors = this.eliminateDuplicates(vendorValues);
      const uniqueBrands = this.eliminateDuplicates(brandValues);

      const uniqueProducts = this.eliminateDuplicates(
        productValues.filter(
          (_, index) =>
            typeof productValues[index] !== 'undefined' &&
            productValues[index] !== '' &&
            productValues[index] !== '?',
        ),
      );

      // Create Units
      for (const unit of uniqueUnits) {
        try {
          await this.createUnit({ name: unit as string });
        } catch (error) {
          console.error(`Error creating unit for ${unit}: ${error.message}`);
        }
      }

      // Create Expense Types
      for (const type of uniqueExpenseTypes) {
        if (type) {
          if (type === '?') {
            continue;
          }
          try {
            await this.createExpenseType({
              name: type as string,
              backgroundColor: '#FB6D48',
            });
          } catch (error) {
            console.error(
              `Error creating expense type for ${type}: ${error.message}`,
            );
          }
        }
      }

      // Create Vendors
      for (const vendor of uniqueVendors) {
        try {
          await this.createVendor({ name: vendor as string });
        } catch (error) {
          console.error(
            `Error creating vendor for ${vendor}: ${error.message}`,
          );
        }
      }

      // Create Brands
      for (const brand of uniqueBrands) {
        try {
          await this.createBrand({ name: brand as string });
        } catch (error) {
          console.error(`Error creating brand for ${brand}: ${error.message}`);
        }
      }

      await this.createStockType({ name: 'Gen', backgroundColor: '#FB6D48' });
      // Create Products
      for (let i = 0; i < productValues.length; i++) {
        try {
          const productBody = {
            name: productValues[i],
            unit: usernamify(unitValues[i] ?? ''),
            brand: [usernamify(brandValues[i] ?? '')],
            vendor: [usernamify(vendorValues[i] ?? '')],
            expenseType: [usernamify(expenseTypeValues[i] ?? '')],
            stockType: 'gen',
          };
          await this.createProductForScript(productBody);
        } catch (error) {
          console.error(
            `Error creating product for ${productValues[i]}: ${error.message}`,
          );
        }

        const invoiceBody = {
          product: usernamify(productValues[i]),
          brand: usernamify(brandValues[i]) ?? '',
          vendor: usernamify(vendorValues[i]) ?? '',
          expenseType: usernamify(expenseTypeValues[i] ?? ''),
          quantity: quantityValues[i],
          totalExpense: totalExpenseValues[i],
          documentNo: documentNoValues[i] ?? '',
          location: locationValues[i] === 'B' ? 1 : 2,
          date: `${
            yearValues[i] && monthValues[i] && dayValues[i]
              ? `${yearValues[i]}-${monthValues[i]
                  .toString()
                  .padStart(2, '0')}-${dayValues[i]
                  .toString()
                  .padStart(2, '0')}`
              : ''
          }`,
        };
        try {
          await this.createInvoice(invoiceBody);
        } catch (error) {
          console.error(
            `Error creating invoice for ${productValues[i]}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      console.error(`Error in runScript: ${error.message}`);
    }
  }

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
