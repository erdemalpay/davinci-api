import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveEventQrDto } from './event-qr.dto';
import { isEventQrVisible } from './event-qr.schema';
import { EventQrService } from './event-qr.service';

describe('SaveEventQrDto', () => {
  const errorsFor = (body: object) =>
    validate(plainToInstance(SaveEventQrDto, body));
  const valid = { title: 'Tasarım Günü', url: 'https://example.com/kayit' };

  it('accepts https links, empty links and optional dates', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(await errorsFor({ ...valid, url: '' })).toHaveLength(0);
    expect(await errorsFor({ ...valid, date: '2026-11-20' })).toHaveLength(0);
    expect(
      await errorsFor({ ...valid, date: '2026-11-20T00:00:00.000Z' }),
    ).toHaveLength(0);
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

  it('rejects malformed dates', async () => {
    const errors = await errorsFor({ ...valid, date: '20.11.2026' });
    expect(errors.map((error) => error.property)).toEqual(['date']);
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
  const setup = (stored: object | null) => {
    const exec = jest.fn().mockResolvedValue(stored);
    const eventQrModel = {
      findById: jest.fn().mockReturnValue({ lean: () => ({ exec }) }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ lean: () => ({ exec }) }),
    };
    return { service: new EventQrService(eventQrModel as never), eventQrModel };
  };

  it('returns only title and url publicly', async () => {
    const { service } = setup({
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '',
    });
    await expect(service.findPublic()).resolves.toEqual({
      title: 'Tasarım Günü',
      url: 'https://example.com',
    });
  });

  it('returns null publicly when the setting is hidden', async () => {
    const { service } = setup({
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '2000-01-01',
    });
    await expect(service.findPublic()).resolves.toBeNull();
  });

  it('upserts the single record and keeps only the day of the date', async () => {
    const { service, eventQrModel } = setup({});
    await service.save({
      title: 'Tasarım Günü',
      url: 'https://example.com',
      date: '2026-11-20T00:00:00.000Z',
    });
    expect(eventQrModel.findByIdAndUpdate).toHaveBeenCalledWith(
      1,
      {
        title: 'Tasarım Günü',
        url: 'https://example.com',
        date: '2026-11-20',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });
});
