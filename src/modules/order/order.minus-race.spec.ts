jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, from } from 'rxjs';
import { LockInterceptor } from '../lock/lock.interceptor';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

const user = { _id: 'kasa' } as any;
const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));

const buildService = (startQuantity: number) => {
  const db = { quantity: startQuantity, credited: 0, writes: 0 };
  const snapshot = () => {
    const doc: any = {
      _id: 1,
      quantity: db.quantity,
      status: 'autoserved',
      stockLocation: 2,
      item: {
        itemProduction: [{ isDecrementStock: true, product: 'p', quantity: 1 }],
      },
    };
    doc.populate = async () => doc;
    return doc;
  };
  const orderModel = {
    findById: jest.fn((_id: number) => {
      const read: any = tick().then(snapshot);
      read.populate = () => tick().then(snapshot);
      return read;
    }),
    findByIdAndUpdate: jest.fn(async (_id: number, updates: any) => {
      await tick();
      db.quantity = updates.quantity;
      db.writes += 1;
      return { _id: 1, ...updates };
    }),
  };
  const accountingService = {
    createStock: jest.fn(async (_u: any, dto: any) => {
      await tick();
      db.credited += dto.quantity;
    }),
    consumptStock: jest.fn(async () => undefined),
  };
  const activityService = { addActivity: jest.fn(async () => undefined) };
  const websocketGateway = { emitOrderUpdated: jest.fn() };

  const service = new (OrderService as any)(
    undefined,
    undefined,
    orderModel,
    ...Array(9).fill(undefined),
    websocketGateway,
    activityService,
    accountingService,
    ...Array(8).fill(undefined),
  );
  return { service, db };
};

describe('"-1" ile adet azaltma ve stok iadesi', () => {
  it('kontrol: tıklamalar sırayla işlenirse iade = adet farkı', async () => {
    const { service, db } = buildService(24);

    for (let quantity = 23; quantity >= 14; quantity--) {
      await service.updateOrder(user, 1, { quantity });
    }

    expect(db.quantity).toBe(14);
    expect(db.credited).toBe(10);
  });

  it('hızlı tıklama: PATCH /order/:id kilidi eşzamanlı istekleri eler, iade = adet farkı kalır', async () => {
    const { service, db } = buildService(24);
    const held = new Set<string>();
    const lockService = {
      acquireMultiple: jest.fn(async (keys: string[]) => {
        if (keys.some((key) => held.has(key))) return false;
        keys.forEach((key) => held.add(key));
        return true;
      }),
      releaseMultiple: jest.fn(async (keys: string[]) =>
        keys.forEach((key) => held.delete(key)),
      ),
    };
    const interceptor = new LockInterceptor(
      new Reflector(),
      lockService as any,
    );
    const context: any = {
      getHandler: () => OrderController.prototype.updateOrder,
      getClass: () => OrderController,
      switchToHttp: () => ({ getRequest: () => ({ params: { id: 1 } }) }),
    };

    // Ekran henüz güncellenmediği için 10 tıklama da "24 - 1 = 23" gönderiyor.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        firstValueFrom(
          interceptor.intercept(context, {
            handle: () => from(service.updateOrder(user, 1, { quantity: 23 })),
          }),
        ),
      ),
    );

    expect(db.quantity).toBe(23);
    expect(db.credited).toBe(24 - db.quantity);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.length).toBe(9);
    rejected.forEach((r) =>
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      ),
    );
  });
});
