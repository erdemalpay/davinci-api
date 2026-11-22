import { HttpException } from '@nestjs/common';

jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class {},
}));

import {
  addressGid,
  cleanText,
  normalizePhone,
  StorefrontAccountService,
  toCustomerMessage,
} from './storefront-account.service';

describe('normalizePhone', () => {
  it.each([
    ['0543 643 00 39', '+905436430039'],
    ['5436430039', '+905436430039'],
    ['905436430039', '+905436430039'],
    ['+90 (543) 643-00-39', '+905436430039'],
    ['0312 123 45 67', '+903121234567'],
    ['+49 151 23456789', '+4915123456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '123', '05436', 'abc', '01234567890'])('rejects %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('cleanText', () => {
  it('trims, collapses spaces and caps length', () => {
    expect(cleanText('  a   b  ')).toBe('a b');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText('abcdef', 3)).toBe('abc');
  });
});

describe('toCustomerMessage', () => {
  it('maps a taken phone to Turkish', () => {
    expect(
      toCustomerMessage(
        { field: ['phone'], message: 'Phone has already been taken' },
        'profile',
      ),
    ).toBe('Bu telefon numarası başka bir hesapta kayıtlı.');
  });

  it('falls back to a generic sentence', () => {
    expect(toCustomerMessage({ message: 'Something' }, 'address')).toBe(
      'Adres kaydedilemedi, lütfen tekrar dene.',
    );
  });
});

describe('StorefrontAccountService', () => {
  const adminGraphQL = jest.fn();
  const service = new StorefrontAccountService({ adminGraphQL } as any);

  beforeEach(() => adminGraphQL.mockReset());

  const addresses = (...ids: string[]) => ({
    customer: {
      addressesV2: {
        nodes: ids.map((id) => ({ id: addressGid(id) })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  });

  it('refuses to touch an address of another customer', async () => {
    adminGraphQL.mockResolvedValueOnce(addresses('111', '222'));
    await expect(service.deleteAddress('9', '333')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(adminGraphQL).toHaveBeenCalledTimes(1);
  });

  it('deletes an owned address with the full gid', async () => {
    adminGraphQL.mockResolvedValueOnce(addresses('111')).mockResolvedValueOnce({
      customerAddressDelete: { deletedAddressId: 'x', userErrors: [] },
    });
    await expect(service.deleteAddress('9', '111')).resolves.toEqual({
      id: '111',
      deleted: true,
    });
    expect(adminGraphQL.mock.calls[1][1]).toEqual({
      customerId: 'gid://shopify/Customer/9',
      addressId: 'gid://shopify/MailingAddress/111?model_name=CustomerAddress',
    });
  });

  it('never sends an email change and normalizes the phone', async () => {
    adminGraphQL.mockResolvedValueOnce({
      customerUpdate: { customer: null, userErrors: [] },
    });
    await service.updateProfile('9', {
      firstName: ' Ada ',
      lastName: 'Lovelace',
      phone: '0532 123 45 67',
      email: 'x@y.z',
    } as any);
    expect(adminGraphQL.mock.calls[0][1]).toEqual({
      input: {
        id: 'gid://shopify/Customer/9',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+905321234567',
      },
    });
  });

  it('turns Shopify userErrors into a Turkish 400', async () => {
    adminGraphQL.mockResolvedValueOnce({
      customerUpdate: {
        customer: null,
        userErrors: [
          { field: ['phone'], message: 'Phone has already been taken' },
        ],
      },
    });
    await expect(
      service.updateProfile('9', {
        firstName: 'A',
        lastName: 'B',
        phone: '05321234567',
      }),
    ).rejects.toThrow('Bu telefon numarası başka bir hesapta kayıtlı.');
  });

  it('requires address line and city', async () => {
    await expect(
      service.createAddress('9', {
        address: { firstName: 'A', lastName: 'B' },
      }),
    ).rejects.toThrow('Adres satırını yazmalısın.');
    expect(adminGraphQL).not.toHaveBeenCalled();
  });
});
