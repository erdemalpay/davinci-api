import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { PaymentMethod } from '../accounting/paymentMethod.schema';
import { Stock } from '../accounting/stock.schema';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Collection } from '../order/collection.schema';
import { Order } from '../order/order.schema';
import { Table } from '../table/table.schema';
import { Brand } from './../accounting/brand.schema';
import { ExpenseType } from './../accounting/expenseType.schema';
import { FixtureInvoice } from './../accounting/fixtureInvoice.schema';
import { Invoice } from './../accounting/invoice.schema';
import { PackageType } from './../accounting/packageType.schema';
import { ServiceInvoice } from './../accounting/serviceInvoice.schema';
import { Unit } from './../accounting/unit.schema';
import { Vendor } from './../accounting/vendor.schema';
import { Game } from './../game/game.schema';

export class ActivityDto {
  @IsNumber()
  _id: number;

  @IsString()
  @ApiProperty()
  actor: string;
}

export enum ActivityType {
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  CREATE_TABLE = 'CREATE_TABLE',
  UPDATE_TABLE = 'UPDATE_TABLE',
  DELETE_TABLE = 'DELETE_TABLE',
  CREATE_GAMEPLAY = 'CREATE_GAMEPLAY',
  UPDATE_GAMEPLAY = 'UPDATE_GAMEPLAY',
  DELETE_GAMEPLAY = 'DELETE_GAMEPLAY',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CREATE_STOCK = 'CREATE_STOCK',
  DELETE_STOCK = 'DELETE_STOCK',
  UPDATE_STOCK = 'UPDATE_STOCK',
  CREATE_EXPENSE = 'CREATE_EXPENSE',
  DELETE_EXPENSE = 'DELETE_EXPENSE',
  UPDATE_EXPENSE = 'UPDATE_EXPENSE',
  CREATE_FIXTUREEXPENSE = 'CREATE_FIXTUREEXPENSE',
  DELETE_FIXTUREEXPENSE = 'DELETE_FIXTUREEXPENSE',
  UPDATE_FIXTUREEXPENSE = 'UPDATE_FIXTUREEXPENSE',
  CREATE_SERVICEEXPENSE = 'CREATE_SERVICEEXPENSE',
  DELETE_SERVICEEXPENSE = 'DELETE_SERVICEEXPENSE',
  UPDATE_SERVICEEXPENSE = 'UPDATE_SERVICEEXPENSE',
  CREATE_UNIT = 'CREATE_UNIT',
  DELETE_UNIT = 'DELETE_UNIT',
  UPDATE_UNIT = 'UPDATE_UNIT',
  CREATE_EXPENSETYPE = 'CREATE_EXPENSETYPE',
  DELETE_EXPENSETYPE = 'DELETE_EXPENSETYPE',
  UPDATE_EXPENSETYPE = 'UPDATE_EXPENSETYPE',
  CREATE_VENDOR = 'CREATE_VENDOR',
  DELETE_VENDOR = 'DELETE_VENDOR',
  UPDATE_VENDOR = 'UPDATE_VENDOR',
  CREATE_BRAND = 'CREATE_BRAND',
  DELETE_BRAND = 'DELETE_BRAND',
  UPDATE_BRAND = 'UPDATE_BRAND',
  CREATE_PACKAGETYPE = 'CREATE_PACKAGETYPE',
  DELETE_PACKAGETYPE = 'DELETE_PACKAGETYPE',
  UPDATE_PACKAGETYPE = 'UPDATE_PACKAGETYPE',
  CREATE_PAYMENTMETHOD = 'CREATE_PAYMENTMETHOD',
  DELETE_PAYMENTMETHOD = 'DELETE_PAYMENTMETHOD',
  UPDATE_PAYMENTMETHOD = 'UPDATE_PAYMENTMETHOD',
  CREATE_ORDER = 'CREATE_ORDER',
  ADD_ORDER = 'ADD_ORDER',
  CANCEL_ORDER = 'CANCEL_ORDER',
  PREPARE_ORDER = 'PREPARE_ORDER',
  DELIVER_ORDER = 'DELIVER_ORDER',
  TAKE_PAYMENT = 'TAKE_PAYMENT',
  GAME_LEARNED_ADD = 'GAME_LEARNED_ADD',
  GAME_LEARNED_REMOVE = 'GAME_LEARNED_REMOVE',
}

export type ActivityTypePayload = {
  [ActivityType.CHANGE_PASSWORD]: void;
  [ActivityType.CREATE_TABLE]: Table;
  [ActivityType.UPDATE_TABLE]: { currentTable: Table; newTable: Table };
  [ActivityType.DELETE_TABLE]: Table;
  [ActivityType.CREATE_GAMEPLAY]: { tableId: number; gameplay: Gameplay };
  [ActivityType.UPDATE_GAMEPLAY]: {
    currentGameplay: GameplayDto;
    newGameplay: GameplayDto;
  };
  [ActivityType.DELETE_GAMEPLAY]: Gameplay;
  [ActivityType.LOGIN]: void;
  [ActivityType.LOGOUT]: void;
  [ActivityType.CREATE_STOCK]: Stock;
  [ActivityType.DELETE_STOCK]: Stock;
  [ActivityType.UPDATE_STOCK]: { currentStock: Stock; newStock: Stock };
  [ActivityType.CREATE_EXPENSE]: Invoice;
  [ActivityType.DELETE_EXPENSE]: Invoice;
  [ActivityType.UPDATE_EXPENSE]: {
    currentExpense: Invoice;
    newExpense: Invoice;
  };
  [ActivityType.CREATE_FIXTUREEXPENSE]: FixtureInvoice;
  [ActivityType.DELETE_FIXTUREEXPENSE]: FixtureInvoice;
  [ActivityType.UPDATE_FIXTUREEXPENSE]: {
    currentExpense: FixtureInvoice;
    newExpense: FixtureInvoice;
  };
  [ActivityType.CREATE_SERVICEEXPENSE]: ServiceInvoice;
  [ActivityType.DELETE_SERVICEEXPENSE]: ServiceInvoice;
  [ActivityType.UPDATE_SERVICEEXPENSE]: {
    currentExpense: ServiceInvoice;
    newExpense: ServiceInvoice;
  };
  [ActivityType.CREATE_UNIT]: Unit;
  [ActivityType.DELETE_UNIT]: Unit;
  [ActivityType.UPDATE_UNIT]: {
    currentUnit: Unit;
    newUnit: Unit;
  };
  [ActivityType.CREATE_EXPENSETYPE]: ExpenseType;
  [ActivityType.DELETE_EXPENSETYPE]: ExpenseType;
  [ActivityType.UPDATE_EXPENSETYPE]: {
    currentExpenseType: ExpenseType;
    newExpenseType: ExpenseType;
  };
  [ActivityType.CREATE_VENDOR]: Vendor;
  [ActivityType.DELETE_VENDOR]: Vendor;
  [ActivityType.UPDATE_VENDOR]: {
    currentVendor: Vendor;
    newVendor: Vendor;
  };
  [ActivityType.CREATE_BRAND]: Brand;
  [ActivityType.DELETE_BRAND]: Brand;
  [ActivityType.UPDATE_BRAND]: {
    currentBrand: Brand;
    newBrand: Brand;
  };
  [ActivityType.CREATE_PACKAGETYPE]: PackageType;
  [ActivityType.DELETE_PACKAGETYPE]: PackageType;
  [ActivityType.UPDATE_PACKAGETYPE]: {
    currentPackageType: PackageType;
    newPackageType: PackageType;
  };
  [ActivityType.CREATE_PAYMENTMETHOD]: PaymentMethod;
  [ActivityType.DELETE_PAYMENTMETHOD]: PaymentMethod;
  [ActivityType.UPDATE_PAYMENTMETHOD]: {
    currentPaymentMethod: PaymentMethod;
    newPaymentMethod: PaymentMethod;
  };
  [ActivityType.CREATE_ORDER]: Order;
  [ActivityType.ADD_ORDER]: Order;
  [ActivityType.CANCEL_ORDER]: Order;
  [ActivityType.PREPARE_ORDER]: Order;
  [ActivityType.DELIVER_ORDER]: Order;
  [ActivityType.TAKE_PAYMENT]: Collection;
  [ActivityType.GAME_LEARNED_ADD]: Game;
  [ActivityType.GAME_LEARNED_REMOVE]: Game;
};

export class ActivityQueryDto {
  user?: string;
  date?: string;
  page?: number;
  limit?: number;
  sort?: string;
  type?: string;
  asc?: number;
}
