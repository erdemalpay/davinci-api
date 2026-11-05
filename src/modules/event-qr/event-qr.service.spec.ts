import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventQrDto, UpdateEventQrDto } from './event-qr.dto';
import { EventQrService } from './event-qr.service';

jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

describe.each([
  ['CreateEventQrDto', CreateEventQrDto],
  ['UpdateEventQrDto', UpdateEventQrDto],
])('%s', (_name, Dto) => {
  const errorsFor = (body: object) => validate(plainToInstance(Dto, body));
  const valid = { title: 'Tasarım Günü', url: 'https://example.com/kayit' };

  it('accepts https links, empty links and a plain day', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(await errorsFor({ ...valid, url: '' })).toHaveLength(0);
    expect(await errorsFor({ ...valid, date: '2026-11-20' })).toHaveLength(0);
    expect(await errorsFor({ ...valid, date: '' })).toHaveLength(0);
  });

  it('rejects links that are not https', async () => {
    for (const url of [
      'http://example.com',
      'javascript:alert(1)',
      'example.com',
    ]) {
      const errors = await errorsFor({ ...valid, url });
      expect(errors.map((error) => error.property)).toEqual(['url']);
    }
  });

  it('rejects anything but YYYY-MM-DD as the day', async () => {
    for (const date of ['20.11.2026', '2026-11-20T00:00:00.000Z']) {
      const errors = await errorsFor({ ...valid, date });
      expect(errors.map((error) => error.property)).toEqual(['date']);
    }
  });
});

describe('EventQrService', () => {
  const setup = (latest: object | null = null) => {
    const exec = jest.fn().mockResolvedValue(latest);
    const sort = jest.fn().mockReturnValue({
      lean: () => ({ exec }),
      exec,
    });
    const eventQrModel = {
      find: jest.fn().mockReturnValue({ sort }),
      findOne: jest.fn().mockReturnValue({ sort }),
      create: jest.fn().mockResolvedValue({}),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const websocketGateway = { emitEventQrChanged: jest.fn() };
    return {
      service: new EventQrService(
        eventQrModel as never,
        websocketGateway as never,
      ),
      eventQrModel,
      websocketGateway,
      sort,
    };
  };

  it('lists newest first', async () => {
    const { service, sort } = setup();
    await service.findAll();
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
  });

  it('returns only title and url publicly, from the latest record', async () => {
    const { service, sort } = setup({
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '',
    });
    await expect(service.findLatest()).resolves.toEqual({
      title: 'Tasarım Günü',
      url: 'https://example.com',
    });
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
  });

  describe('public visibility of the latest record', () => {
    const record = {
      title: 'Kutu Oyunu Tasarım Günü',
      url: 'https://example.com/kayit',
      date: '2026-11-20',
    };
    const visibleAt = async (now: string, latest: object | null = record) => {
      jest.useFakeTimers().setSystemTime(new Date(now));
      return (await setup(latest).service.findLatest()) !== null;
    };
    afterEach(() => jest.useRealTimers());

    it('shows the button until the day before the event', async () => {
      expect(await visibleAt('2026-11-04T09:00:00Z')).toBe(true);
      // 19 Kasım 23:59:59 İstanbul
      expect(await visibleAt('2026-11-19T20:59:59Z')).toBe(true);
    });

    it('hides it from Istanbul midnight of the event day', async () => {
      // 20 Kasım 00:00:00 İstanbul
      expect(await visibleAt('2026-11-19T21:00:00Z')).toBe(false);
      expect(await visibleAt('2026-11-21T10:00:00Z')).toBe(false);
    });

    it('shows it without a day until the day is set', async () => {
      expect(
        await visibleAt('2030-01-01T00:00:00Z', { ...record, date: '' }),
      ).toBe(true);
    });

    it('hides it when the title or link is empty or nothing is saved', async () => {
      expect(
        await visibleAt('2026-11-04T09:00:00Z', { ...record, title: '' }),
      ).toBe(false);
      expect(
        await visibleAt('2026-11-04T09:00:00Z', { ...record, url: '' }),
      ).toBe(false);
      expect(await visibleAt('2026-11-04T09:00:00Z', null)).toBe(false);
    });
  });

  it('saves exactly what the panel sent on create and update', async () => {
    const { service, eventQrModel } = setup({});
    const body = {
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '2026-11-20',
    };
    await service.create(body);
    expect(eventQrModel.create).toHaveBeenCalledWith(body);

    await service.update(3, { title: 'Yeni başlık' });
    expect(eventQrModel.findByIdAndUpdate).toHaveBeenCalledWith(
      3,
      { title: 'Yeni başlık' },
      { new: true },
    );
  });

  it('tells the panels after every write, not after reads', async () => {
    const { service, websocketGateway } = setup({});
    await service.findAll();
    await service.findLatest();
    expect(websocketGateway.emitEventQrChanged).not.toHaveBeenCalled();

    await service.create({ title: 'Tasarım Günü', url: 'https://example.com' });
    expect(websocketGateway.emitEventQrChanged).toHaveBeenCalledTimes(1);

    await service.update(3, { title: 'Yeni başlık' });
    expect(websocketGateway.emitEventQrChanged).toHaveBeenCalledTimes(2);
  });
});
