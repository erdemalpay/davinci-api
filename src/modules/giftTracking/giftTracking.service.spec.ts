import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateGiftDto,
  CreateGiftRecipientDto,
  UpdateGiftDto,
  UpdateGiftRecipientDto,
  updateBodyPipe,
} from './giftTracking.dto';
import { Gift, GiftRecipient, GiftTag } from './giftTracking.schema';
import { GiftTrackingService } from './giftTracking.service';

describe('instagramUrl doğrulaması', () => {
  it('oluştururken https olmayan adresi reddeder', async () => {
    const dto = plainToInstance(CreateGiftRecipientDto, {
      name: 'Nefes',
      instagramUrl: 'javascript:alert(1)',
    });
    expect(await validate(dto)).toHaveLength(1);
  });

  it('güncellerken https olmayan adresi reddeder', async () => {
    const dto = plainToInstance(UpdateGiftRecipientDto, {
      name: 'Nefes',
      instagramUrl: 'javascript:alert(1)',
    });
    expect(await validate(dto)).toHaveLength(1);
  });

  it('https ve boş adresi kabul eder', async () => {
    for (const instagramUrl of ['https://www.instagram.com/nefes', '']) {
      const dto = plainToInstance(UpdateGiftRecipientDto, {
        name: 'Nefes',
        instagramUrl,
      });
      expect(await validate(dto)).toHaveLength(0);
    }
  });
});

describe('hediye türü doğrulaması', () => {
  it('geçersiz türü reddeder', async () => {
    const dto = plainToInstance(CreateGiftDto, {
      recipient: 7,
      date: '2026-11-09',
      items: [{ product: 'trio_turkce', quantity: 1 }],
      type: 'SALE',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(['type']);
  });
});

function build(models: { tag?: object; recipient?: object; gift?: object }) {
  const gateway = { emitGiftTrackingChanged: jest.fn() };
  const service = new GiftTrackingService(
    (models.tag ?? {}) as unknown as Model<GiftTag>,
    (models.recipient ?? {}) as unknown as Model<GiftRecipient>,
    (models.gift ?? {}) as unknown as Model<Gift>,
    gateway as unknown as AppWebSocketGateway,
  );
  return { service, gateway };
}

const user = { _id: 'mehmet' } as unknown as User;

describe('hediye kalemleri doğrulaması', () => {
  const base = { recipient: 7, date: '2026-11-09' };

  it('oyun başına farklı adetleri kabul eder', async () => {
    const dto = plainToInstance(CreateGiftDto, {
      ...base,
      items: [
        { product: 'catanadet', quantity: 2 },
        { product: 'kale_kombo', quantity: 1 },
      ],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('sıfır adetli kalemi reddeder', async () => {
    const dto = plainToInstance(CreateGiftDto, {
      ...base,
      items: [{ product: 'catanadet', quantity: 0 }],
    });
    expect(await validate(dto)).toHaveLength(1);
  });

  it('boş kalem listesini reddeder', async () => {
    const dto = plainToInstance(CreateGiftDto, { ...base, items: [] });
    expect(await validate(dto)).toHaveLength(1);
  });
});

describe('removeRecipient', () => {
  it('hediyesi olan alıcıyı silmez', async () => {
    const findByIdAndDelete = jest.fn();
    const { service, gateway } = build({
      recipient: { findByIdAndDelete },
      gift: { countDocuments: jest.fn().mockResolvedValue(2) },
    });
    await expect(service.removeRecipient(1)).rejects.toThrow(
      'This recipient has gifts',
    );
    expect(findByIdAndDelete).not.toHaveBeenCalled();
    expect(gateway.emitGiftTrackingChanged).not.toHaveBeenCalled();
  });

  it('hediyesi olmayan alıcıyı siler', async () => {
    const findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 1 });
    const { service, gateway } = build({
      recipient: { findByIdAndDelete },
      gift: { countDocuments: jest.fn().mockResolvedValue(0) },
    });
    await service.removeRecipient(1);
    expect(findByIdAndDelete).toHaveBeenCalledWith(1);
    expect(gateway.emitGiftTrackingChanged).toHaveBeenCalled();
  });
});

describe('createGift', () => {
  const dto = {
    recipient: 7,
    date: '2026-11-09',
    items: [{ product: 'trio_turkce', quantity: 2 }],
  };

  it('var olmayan alıcıya hediye girmez', async () => {
    const create = jest.fn();
    const { service } = build({
      recipient: { exists: jest.fn().mockResolvedValue(null) },
      gift: { create },
    });
    await expect(service.createGift(user, dto)).rejects.toThrow(
      'Recipient not found',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('hediyeyi ekleyeniyle kaydedip event yayınlar', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 1 });
    const { service, gateway } = build({
      recipient: { exists: jest.fn().mockResolvedValue({ _id: 7 }) },
      gift: { create },
    });
    await service.createGift(user, dto);
    expect(create).toHaveBeenCalledWith({ ...dto, createdBy: 'mehmet' });
    expect(gateway.emitGiftTrackingChanged).toHaveBeenCalled();
  });
});

describe('updateBodyPipe', () => {
  it('hediye kalemlerindeki bilinmeyen alanları atar', async () => {
    const body = await updateBodyPipe.transform(
      {
        recipient: 7,
        date: '2026-11-09',
        items: [{ product: 'catanadet', quantity: 2, $set: { x: 1 } }],
      },
      { type: 'body', metatype: UpdateGiftDto },
    );
    expect(body.items[0]).not.toHaveProperty('$set');
    expect(body.items[0].quantity).toBe(2);
  });

  it('$set ve _id gibi alanları atar', async () => {
    const body = await updateBodyPipe.transform(
      {
        name: 'N',
        _id: 5,
        $set: { instagramUrl: 'javascript:alert(1)' },
      },
      { type: 'body', metatype: UpdateGiftRecipientDto },
    );
    expect(body).not.toHaveProperty('$set');
    expect(body).not.toHaveProperty('_id');
    expect(body).toHaveProperty('name', 'N');
  });
});

describe('updateGift', () => {
  it('var olmayan alıcıya taşımaz', async () => {
    const findByIdAndUpdate = jest.fn();
    const { service, gateway } = build({
      recipient: { exists: jest.fn().mockResolvedValue(null) },
      gift: { findByIdAndUpdate },
    });
    await expect(service.updateGift(1, { recipient: 9 })).rejects.toThrow(
      'Recipient not found',
    );
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect(gateway.emitGiftTrackingChanged).not.toHaveBeenCalled();
  });

  it('var olan alıcıyla günceller ve event yayınlar', async () => {
    const findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: 1 });
    const { service, gateway } = build({
      recipient: { exists: jest.fn().mockResolvedValue({ _id: 9 }) },
      gift: { findByIdAndUpdate },
    });
    await service.updateGift(1, { recipient: 9 });
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      1,
      { recipient: 9 },
      { new: true },
    );
    expect(gateway.emitGiftTrackingChanged).toHaveBeenCalled();
  });
});
