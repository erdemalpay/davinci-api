import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveEventQrDto } from './event-qr.dto';
import { isEventQrVisible } from './event-qr.schema';
import { EventQrService } from './event-qr.service';

jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

describe('SaveEventQrDto', () => {
  const errorsFor = (body: object) =>
    validate(plainToInstance(SaveEventQrDto, body));
  const valid = { title: 'Tasarım Günü', url: 'https://example.com/kayit' };

  it('accepts https links, empty links, a plain day and partial bodies', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(await errorsFor({ ...valid, url: '' })).toHaveLength(0);
    expect(await errorsFor({ ...valid, date: '2026-11-20' })).toHaveLength(0);
    expect(await errorsFor({ ...valid, date: '' })).toHaveLength(0);
    expect(await errorsFor({ date: '2026-11-20' })).toHaveLength(0);
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

describe('isEventQrVisible', () => {
  const setting = {
    title: 'Kutu Oyunu Tasarım Günü',
    url: 'https://example.com/kayit',
    date: '2026-11-20',
  };

  it('shows the button until the day before the event', () => {
    expect(isEventQrVisible(setting, '2026-11-04')).toBe(true);
    expect(isEventQrVisible(setting, '2026-11-19')).toBe(true);
  });

  it('hides it from the morning of the event day', () => {
    expect(isEventQrVisible(setting, '2026-11-20')).toBe(false);
    expect(isEventQrVisible(setting, '2026-11-21')).toBe(false);
  });

  it('shows it without a date until it is cleared', () => {
    expect(isEventQrVisible({ ...setting, date: '' }, '2030-01-01')).toBe(true);
  });

  it('hides it when empty or missing', () => {
    expect(isEventQrVisible({ ...setting, title: '' }, '2026-11-04')).toBe(
      false,
    );
    expect(isEventQrVisible({ ...setting, url: '' }, '2026-11-04')).toBe(false);
    expect(isEventQrVisible(null, '2026-11-04')).toBe(false);
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

  it('returns null publicly when the latest record is hidden or missing', async () => {
    const expired = setup({
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '2000-01-01',
    });
    await expect(expired.service.findLatest()).resolves.toBeNull();
    const none = setup(null);
    await expect(none.service.findLatest()).resolves.toBeNull();
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
