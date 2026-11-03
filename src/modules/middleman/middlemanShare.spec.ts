import { Model } from 'mongoose';
import { findMiddlemanShares } from './middlemanShare';

// A model whose find(...).select(...).lean() returns `docs`.
const modelOf = (docs: unknown[]) => {
  const find = jest.fn(() => ({
    select: () => ({ lean: async () => docs }),
  }));
  return { find } as unknown as Model<any> & { find: jest.Mock };
};

describe('findMiddlemanShares', () => {
  function build() {
    const models = {
      middleman: modelOf([
        {
          user: 'kemal',
          location: 1,
          date: '2026-10-30',
          startHour: '14:00',
          finishHour: '18:00',
        },
      ]),
      shift: modelOf([
        {
          day: '2026-10-30',
          location: 1,
          shifts: [{ shift: '14:00', user: ['kemal'] }],
        },
      ]),
      location: modelOf([
        { _id: 1, shifts: [{ shift: '14:00', shiftEndHour: '22:00' }] },
      ]),
      buttonCall: modelOf([
        {
          assignedTo: 'kemal',
          date: '2026-10-30',
          assignedHour: '14:30',
          finishHour: '14:50',
        },
      ]),
      break: modelOf([
        {
          user: 'kemal',
          date: '2026-10-30',
          startHour: '16:00',
          finishHour: '16:30',
        },
      ]),
      gameplayTime: modelOf([
        {
          user: 'kemal',
          date: '2026-10-30',
          startHour: '17:00',
          finishHour: '17:10',
        },
      ]),
    };
    return models;
  }

  it('takes calls, breaks and explanations out of the middleman time', async () => {
    const models = build();

    const shares = await findMiddlemanShares(
      models as never,
      '2026-10-01',
      '2026-10-30',
    );

    expect(shares.get('kemal')).toEqual({
      seconds: 4 * 3600 - 60 * 60, // 20m call, 30m break, 10m explaining
      workedSeconds: 8 * 3600, // end hour from the location's shifts
      dates: ['2026-10-30'],
    });
  });

  it('reads only finished calls assigned to someone within the dates', async () => {
    const models = build();

    await findMiddlemanShares(models as never, '2026-10-01', '2026-10-30');

    const [filter] = models.buttonCall.find.mock.calls[0];
    expect(filter).toMatchObject({
      date: { $gte: '2026-10-01', $lte: '2026-10-30' },
      assignedTo: { $exists: true },
      assignedHour: { $exists: true },
      finishHour: { $exists: true },
    });
    expect(models.shift.find.mock.calls[0][0]).toEqual({
      day: { $gte: '2026-10-01', $lte: '2026-10-30' },
    });
  });
});
