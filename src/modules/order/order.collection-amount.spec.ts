jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpException, HttpStatus } from '@nestjs/common';
import { OrderService } from './order.service';

// Rejected amounts are refused before any lock, transaction or write, so the
// service needs no dependencies here.
const buildService = () =>
  new (OrderService as any)(...Array(30).fill(undefined)) as OrderService;

const user = { _id: 'can' } as any;
const collection = (amount: number, orders = [{ order: 1, paidQuantity: 1 }]) =>
  ({
    location: 2,
    amount,
    status: 'paid',
    paymentMethod: 'credit_card',
    orders,
  } as any);

const expectBadRequest = async (promise: Promise<unknown>) => {
  const error = (await promise.catch((e) => e)) as HttpException;
  expect(error).toBeInstanceOf(HttpException);
  expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
};

describe('OrderService.createCollection amount', () => {
  it('rejects a negative amount', async () => {
    await expectBadRequest(
      buildService().createCollection(user, collection(-450)),
    );
  });

  it('rejects 0 when no order is paid with it', async () => {
    await expectBadRequest(
      buildService().createCollection(user, collection(0, [])),
    );
  });

  it('rejects a missing amount', async () => {
    await expectBadRequest(
      buildService().createCollection(user, collection(Number.NaN)),
    );
  });

  it('lets 0 through for free orders being marked paid', async () => {
    const error = await buildService()
      .createCollection(user, collection(0))
      .catch((e: unknown) => e);
    // Gets past the amount check (and fails later on the missing
    // dependencies), so it isn't refused as a bad amount.
    expect(
      error instanceof HttpException &&
        error.getStatus() === HttpStatus.BAD_REQUEST,
    ).toBe(false);
  });
});
