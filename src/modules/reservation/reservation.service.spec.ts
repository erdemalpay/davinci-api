import { ReservationService } from './reservation.service';

describe('ReservationService call update', () => {
  function build(lastOrder: { _id: number; order: number }) {
    const findByIdAndUpdate = jest.fn(
      async (_id: number, _update: unknown) => ({}),
    );
    const reservationModel = {
      findById: jest.fn(async (id: number) => ({ _id: id })),
      findOne: jest.fn(() => ({ sort: jest.fn(async () => lastOrder) })),
      findByIdAndUpdate,
    };
    const service = new ReservationService(
      reservationModel as never,
      { emitReservationChanged: jest.fn() } as never,
      { addUpdateActivity: jest.fn() } as never,
    );
    const update = () =>
      findByIdAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    return { service, update };
  }

  it('moves someone who will come later to the end of the waiting list', async () => {
    const { service, update } = build({ _id: 9, order: 120 });

    await service.callUpdate({} as never, 5, {
      status: 'Waiting',
      moveToEnd: true,
    } as never);

    expect(update()).toMatchObject({ status: 'Waiting', order: 121 });
    expect(update().$inc).toEqual({ callCount: 1 });
  });

  it('keeps the order of someone already at the end', async () => {
    const { service, update } = build({ _id: 5, order: 120 });

    await service.callUpdate({} as never, 5, {
      status: 'Waiting',
      moveToEnd: true,
    } as never);

    expect(update().order).toBeUndefined();
  });

  it('keeps the order for the other answers', async () => {
    const { service, update } = build({ _id: 9, order: 120 });

    await service.callUpdate({} as never, 5, {
      status: 'Not responded',
    } as never);

    expect(update().order).toBeUndefined();
    expect(update().moveToEnd).toBeUndefined();
  });
});
