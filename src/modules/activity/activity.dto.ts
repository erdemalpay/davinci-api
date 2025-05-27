import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { Expense } from '../accounting/expense.schema';
import { PaymentMethod } from '../accounting/paymentMethod.schema';
import { Product } from '../accounting/product.schema';
import { Stock } from '../accounting/stock.schema';
import { Authorization } from '../authorization/authorization.schema';
import { GameplayDto } from '../gameplay/dto/gameplay.dto';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Collection } from '../order/collection.schema';
import { Reservation } from '../reservation/reservation.schema';
import { Table } from '../table/table.schema';
import { Brand } from './../accounting/brand.schema';
import { ExpenseType } from './../accounting/expenseType.schema';
import { Vendor } from './../accounting/vendor.schema';
import { Game } from './../game/game.schema';
import { MenuItem } from './../menu/item.schema';
import { Order } from './../order/order.schema';
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
  CREATE_SERVICEEXPENSE = 'CREATE_SERVICEEXPENSE',
  DELETE_SERVICEEXPENSE = 'DELETE_SERVICEEXPENSE',
  UPDATE_SERVICEEXPENSE = 'UPDATE_SERVICEEXPENSE',
  CREATE_EXPENSETYPE = 'CREATE_EXPENSETYPE',
  DELETE_EXPENSETYPE = 'DELETE_EXPENSETYPE',
  UPDATE_EXPENSETYPE = 'UPDATE_EXPENSETYPE',
  CREATE_VENDOR = 'CREATE_VENDOR',
  DELETE_VENDOR = 'DELETE_VENDOR',
  UPDATE_VENDOR = 'UPDATE_VENDOR',
  CREATE_BRAND = 'CREATE_BRAND',
  DELETE_BRAND = 'DELETE_BRAND',
  UPDATE_BRAND = 'UPDATE_BRAND',
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
  UPDATE_MENU_ITEM = 'UPDATE_MENU_ITEM',
  ORDER_DISCOUNT = 'ORDER_DISCOUNT',
  ORDER_DISCOUNT_CANCEL = 'ORDER_DISCOUNT_CANCEL',
  CANCEL_PAYMENT = 'CANCEL_PAYMENT',
  CREATE_RESERVATION = 'CREATE_RESERVATION',
  UPDATE_RESERVATION = 'UPDATE_RESERVATION',
  UPDATE_AUTHORIZATION = 'UPDATE_AUTHORIZATION',
  UPDATE_ACCOUNT_PRODUCT = 'UPDATE_ACCOUNT_PRODUCT',
  FARM_BURGER_ACTIVATED = 'FARM_BURGER_ACTIVATED',
  FARM_BURGER_DEACTIVATED = 'FARM_BURGER_DEACTIVATED',
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
  [ActivityType.CREATE_EXPENSE]: Expense;
  [ActivityType.DELETE_EXPENSE]: Expense;
  [ActivityType.UPDATE_EXPENSE]: {
    currentExpense: Expense;
    newExpense: Expense;
  };
  [ActivityType.CREATE_SERVICEEXPENSE]: Expense;
  [ActivityType.DELETE_SERVICEEXPENSE]: Expense;
  [ActivityType.UPDATE_SERVICEEXPENSE]: {
    currentExpense: Expense;
    newExpense: Expense;
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
  [ActivityType.UPDATE_MENU_ITEM]: {
    currentMenuItem: MenuItem;
    newMenuItem: MenuItem;
  };
  [ActivityType.ORDER_DISCOUNT]: Order;
  [ActivityType.ORDER_DISCOUNT_CANCEL]: Order;
  [ActivityType.CANCEL_PAYMENT]: Collection;
  [ActivityType.CREATE_RESERVATION]: Reservation;
  [ActivityType.UPDATE_RESERVATION]: {
    currentReservation: Reservation;
    newReservation: Reservation;
  };
  [ActivityType.UPDATE_AUTHORIZATION]: {
    currentAuthorization: Authorization;
    newAuthorization: Authorization;
  };
  [ActivityType.UPDATE_ACCOUNT_PRODUCT]: {
    currentAccountProduct: Product;
    newAccountProduct: Product;
  };
  [ActivityType.FARM_BURGER_ACTIVATED]: void;
  [ActivityType.FARM_BURGER_DEACTIVATED]: void;
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
