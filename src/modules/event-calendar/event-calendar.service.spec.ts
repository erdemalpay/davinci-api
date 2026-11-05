import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateEventCalendarDto,
  UpdateEventCalendarDto,
} from './event-calendar.dto';
import { EventCalendarService } from './event-calendar.service';

jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

const item = {
  badge: ['15', 'KASIM', 'PAZAR'],
  color: '#d94a4a',
  title: 'Kale Kombo Turnuvası',
  description: 'En iyi kaleyi kur.',
  icon: 'castle',
};

describe.each([
  ['CreateEventCalendarDto', CreateEventCalendarDto],
  ['UpdateEventCalendarDto', UpdateEventCalendarDto],
])('%s', (_name, Dto) => {
  const errorsFor = (body: object) => validate(plainToInstance(Dto, body));
  const valid = { title: 'KASIM AYI', items: [item] };

  it('accepts preset keys, https icons, no icon and hasQr', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(
      await errorsFor({
        ...valid,
        items: [{ ...item, icon: 'https://x.com/a.png' }],
      }),
    ).toHaveLength(0);
    expect(
      await errorsFor({ ...valid, items: [{ ...item, icon: '' }] }),
    ).toHaveLength(0);
    expect(await errorsFor({ ...valid, hasQr: false })).toHaveLength(0);
  });

  it('rejects a non-boolean hasQr', async () => {
    const errors = await errorsFor({ ...valid, hasQr: 'yes' });
    expect(errors.map((error) => error.property)).toEqual(['hasQr']);
  });

  it('rejects unsafe icons and bad colors inside items', async () => {
    for (const patch of [
      { icon: 'http://x.com/a.png' },
      { icon: 'javascript:alert(1)' },
      { color: 'red' },
      { badge: ['a', 'b', 'c', 'd'] },
    ]) {
      const errors = await errorsFor({
        ...valid,
        items: [{ ...item, ...patch }],
      });
      expect(errors.map((error) => error.property)).toEqual(['items']);
    }
  });

  it('rejects more than 8 rows', async () => {
    const errors = await errorsFor({ ...valid, items: Array(9).fill(item) });
    expect(errors.map((error) => error.property)).toEqual(['items']);
  });
});

describe('EventCalendarService', () => {
  const setup = (latest: object | null = null) => {
    const exec = jest.fn().mockResolvedValue(latest);
    const sort = jest.fn().mockReturnValue({
      lean: () => ({ exec }),
      exec,
    });
    const eventCalendarModel = {
      find: jest.fn().mockReturnValue({ sort }),
      findOne: jest.fn().mockReturnValue({ sort }),
      create: jest.fn().mockResolvedValue({}),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const websocketGateway = { emitEventCalendarChanged: jest.fn() };
    return {
      service: new EventCalendarService(
        eventCalendarModel as never,
        websocketGateway as never,
      ),
      eventCalendarModel,
      websocketGateway,
      sort,
    };
  };

  it('lists newest first', async () => {
    const { service, sort } = setup();
    await service.findAll();
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
  });

  it('returns title, items and hasQr publicly, from the latest record', async () => {
    const { service, sort } = setup({ _id: 2, title: 'KASIM', items: [item] });
    await expect(service.findLatest()).resolves.toEqual({
      title: 'KASIM',
      items: [item],
      hasQr: true,
    });
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
  });

  it('keeps hasQr off only when it was explicitly turned off', async () => {
    const off = setup({ _id: 2, title: 'K', items: [item], hasQr: false });
    expect((await off.service.findLatest())?.hasQr).toBe(false);
    const old = setup({ _id: 1, title: 'K', items: [item] });
    expect((await old.service.findLatest())?.hasQr).toBe(true);
  });

  it('returns null without a record or without rows', async () => {
    expect(await setup(null).service.findLatest()).toBeNull();
    expect(
      await setup({ _id: 1, title: 'KASIM', items: [] }).service.findLatest(),
    ).toBeNull();
  });

  it('saves exactly what the panel sent on create and update', async () => {
    const { service, eventCalendarModel } = setup({});
    const body = { title: 'KASIM', items: [item], hasQr: false };
    await service.create(body);
    expect(eventCalendarModel.create).toHaveBeenCalledWith(body);

    await service.update(3, { title: 'ARALIK' });
    expect(eventCalendarModel.findByIdAndUpdate).toHaveBeenCalledWith(
      3,
      { title: 'ARALIK' },
      { new: true },
    );
  });

  it('tells the panels after every write, not after reads', async () => {
    const { service, websocketGateway } = setup({});
    await service.findAll();
    await service.findLatest();
    expect(websocketGateway.emitEventCalendarChanged).not.toHaveBeenCalled();

    await service.create({ title: 'KASIM', items: [item] });
    expect(websocketGateway.emitEventCalendarChanged).toHaveBeenCalledTimes(1);

    await service.update(3, { title: 'ARALIK' });
    expect(websocketGateway.emitEventCalendarChanged).toHaveBeenCalledTimes(2);
  });
});
