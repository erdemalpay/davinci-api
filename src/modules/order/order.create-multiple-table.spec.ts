jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpException, HttpStatus } from '@nestjs/common';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';
import { CreateOrderDto } from './order.dto';
import { OrderService } from './order.service';

const user = { _id: 'ceren' } as unknown as User;
const burger = { item: 422, quantity: 1, location: 2 } as CreateOrderDto;

// Panelde masa açılırken sunucu cevabı gelmeden gösterilen masa: _id yok.
const tableWithoutId = {
  name: '13',
  location: 2,
  date: '2026-11-16',
} as unknown as Table;

const buildService = (foundTable: Partial<Table> | null = null) => {
  const service = Object.create(OrderService.prototype) as OrderService;
  const tableService = { findById: jest.fn(async () => foundTable) };
  const websocketGateway = { emitSingleTableChanged: jest.fn() };
  Object.assign(service, { tableService, websocketGateway });
  return { service, tableService };
};

describe('createMultipleOrder table check', () => {
  it('rejects orders for a table that has no _id yet', async () => {
    const { service, tableService } = buildService();

    const result = service.createMultipleOrder(user, [burger], tableWithoutId);

    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(tableService.findById).not.toHaveBeenCalled();
  });

  it('still looks the table up when it has an _id', async () => {
    const { service, tableService } = buildService({
      _id: 87413,
      finishHour: '22:59',
    });
    const table = { ...tableWithoutId, _id: 87413 } as unknown as Table;

    await expect(
      service.createMultipleOrder(user, [burger], table),
    ).rejects.toMatchObject({ message: 'Cannot add orders to a closed table' });
    expect(tableService.findById).toHaveBeenCalledWith(87413);
  });
});
