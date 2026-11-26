jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StockHistoryStatusEnum, StockTransferDto } from './accounting.dto';
import { AccountingService } from './accounting.service';

const user = { _id: 'hilmi' } as never;

describe('StockTransferDto', () => {
  // main.ts'teki ValidationPipe gibi: "4" sayıya çevrilir
  const errorsFor = (body: object) =>
    validate(
      plainToInstance(StockTransferDto, body, {
        enableImplicitConversion: true,
      }),
    );
  const valid = {
    currentStockLocation: 6,
    transferredStockLocation: 2,
    product: 'flip_7_turkce',
    quantity: 4,
  };

  it('geçerli transferi ve metin olarak gelen sayıyı kabul eder', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(await errorsFor({ ...valid, quantity: '4' })).toHaveLength(0);
  });

  it('sıfır, eksi ya da sayı olmayan adedi reddeder', async () => {
    for (const quantity of [0, -4, 'dört']) {
      const errors = await errorsFor({ ...valid, quantity });
      expect(errors.map((error) => error.property)).toEqual(['quantity']);
    }
  });
});

describe('stockTransfer', () => {
  const fromStock = { _id: 'flip_7_turkce6', location: 6, quantity: 2297 };
  const toStock = { _id: 'flip_7_turkce2', location: 2, quantity: 20 };

  function build() {
    const createStock = jest
      .fn()
      .mockImplementation(async (_user: unknown, dto: { location: number }) =>
        dto.location === 6 ? fromStock : toStock,
      );
    const emitStockChanged = jest.fn();
    const service = Object.assign(Object.create(AccountingService.prototype), {
      stockModel: {
        findById: jest.fn().mockResolvedValue({ ...fromStock, quantity: 2301 }),
      },
      websocketGateway: { emitStockChanged },
      createStock,
    }) as AccountingService;
    return { service, createStock, emitStockChanged };
  }

  it('iki stoğu da tek olayla gönderir', async () => {
    const { service, createStock, emitStockChanged } = build();

    await service.stockTransfer(user, 6, 2, 'flip_7_turkce', 4);

    expect(createStock).toHaveBeenCalledWith(
      user,
      {
        product: 'flip_7_turkce',
        location: 2,
        quantity: 4,
        status: StockHistoryStatusEnum.STOCKTRANSFER,
      },
      false,
    );
    expect(createStock).toHaveBeenCalledWith(
      user,
      {
        product: 'flip_7_turkce',
        location: 6,
        quantity: -4,
        status: StockHistoryStatusEnum.STOCKTRANSFER,
      },
      false,
    );
    expect(emitStockChanged).toHaveBeenCalledTimes(1);
    expect(emitStockChanged).toHaveBeenCalledWith([toStock, fromStock]);
  });

  it('aynı konuma transferi reddeder ve stoğa dokunmaz', async () => {
    const { service, createStock } = build();

    await expect(
      service.stockTransfer(user, 6, 6, 'flip_7_turkce', 4),
    ).rejects.toBeInstanceOf(HttpException);
    expect(createStock).not.toHaveBeenCalled();
  });
});
