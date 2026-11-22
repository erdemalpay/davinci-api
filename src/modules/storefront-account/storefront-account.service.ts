import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ShopifyService } from '../shopify/shopify.service';
import {
  AddressDto,
  SaveAddressDto,
  UpdateProfileDto,
} from './storefront-account.dto';

// Messages here are shown to customers on kutuoyunual.com.
const badRequest = (message: string) =>
  new HttpException(message, HttpStatus.BAD_REQUEST);

const MAX_LENGTH = 255;

// Trims, collapses whitespace and caps the length; null when empty.
export function cleanText(value: unknown, max = MAX_LENGTH): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

// Turkish numbers as people type them ("0543 643 00 39", "543...", "+90 ...")
// → E.164 ("+905436430039"). Other international numbers are kept if they
// already start with "+". Returns null when it doesn't look like a phone.
export function normalizePhone(value: unknown): string | null {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (raw.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  let national = digits;
  if (national.startsWith('90') && national.length === 12) {
    national = national.slice(2);
  } else if (national.startsWith('0') && national.length === 11) {
    national = national.slice(1);
  }
  return /^[2-9]\d{9}$/.test(national) ? `+90${national}` : null;
}

export const customerGid = (id: string) => `gid://shopify/Customer/${id}`;

// Liquid gives the numeric id; the Admin API wants the full MailingAddress gid.
export const addressGid = (id: string) =>
  `gid://shopify/MailingAddress/${id}?model_name=CustomerAddress`;

const numericId = (value: unknown): string | null => {
  const id = String(value ?? '')
    .split('?')[0]
    .split('/')
    .pop();
  return id && /^\d+$/.test(id) ? id : null;
};

type UserError = { field?: string[] | null; message: string };

@Injectable()
export class StorefrontAccountService {
  private readonly logger = new Logger(StorefrontAccountService.name);

  constructor(private readonly shopifyService: ShopifyService) {}

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const firstName = cleanText(dto?.firstName, 100);
    const lastName = cleanText(dto?.lastName, 100);
    if (!firstName) throw badRequest('Adını yazmalısın.');
    if (!lastName) throw badRequest('Soyadını yazmalısın.');

    const input: Record<string, any> = {
      id: customerGid(customerId),
      firstName,
      lastName,
    };
    if (dto && 'phone' in dto) {
      const phoneText = cleanText(dto.phone, 40);
      if (!phoneText) {
        input.phone = null;
      } else {
        const phone = normalizePhone(phoneText);
        if (!phone) {
          throw badRequest('Telefon numarası geçersiz. Örnek: 0532 123 45 67');
        }
        input.phone = phone;
      }
    }

    const data = await this.shopifyService.adminGraphQL<any>(
      `mutation UpdateProfile($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id firstName lastName defaultPhoneNumber { phoneNumber } }
          userErrors { field message }
        }
      }`,
      { input },
    );
    this.throwUserErrors(data?.customerUpdate?.userErrors, 'profile');
    const customer = data?.customerUpdate?.customer;
    return {
      firstName: customer?.firstName ?? firstName,
      lastName: customer?.lastName ?? lastName,
      phone: customer?.defaultPhoneNumber?.phoneNumber ?? null,
    };
  }

  async createAddress(customerId: string, dto: SaveAddressDto) {
    const address = this.cleanAddress(dto?.address);
    const data = await this.shopifyService.adminGraphQL<any>(
      `mutation CreateAddress($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
        customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
          address { id }
          userErrors { field message }
        }
      }`,
      {
        customerId: customerGid(customerId),
        address,
        setAsDefault: dto?.setAsDefault === true,
      },
    );
    this.throwUserErrors(data?.customerAddressCreate?.userErrors, 'address');
    return { id: numericId(data?.customerAddressCreate?.address?.id) };
  }

  async updateAddress(
    customerId: string,
    addressIdParam: string,
    dto: SaveAddressDto,
  ) {
    const addressId = await this.ownedAddressId(customerId, addressIdParam);
    const address = this.cleanAddress(dto?.address);
    const data = await this.shopifyService.adminGraphQL<any>(
      `mutation UpdateAddress($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
        customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) {
          address { id }
          userErrors { field message }
        }
      }`,
      {
        customerId: customerGid(customerId),
        addressId: addressGid(addressId),
        address,
        // Only ever turns default on; unticking doesn't leave the customer without one.
        setAsDefault: dto?.setAsDefault === true ? true : undefined,
      },
    );
    this.throwUserErrors(data?.customerAddressUpdate?.userErrors, 'address');
    return { id: addressId };
  }

  async deleteAddress(customerId: string, addressIdParam: string) {
    const addressId = await this.ownedAddressId(customerId, addressIdParam);
    const data = await this.shopifyService.adminGraphQL<any>(
      `mutation DeleteAddress($customerId: ID!, $addressId: ID!) {
        customerAddressDelete(customerId: $customerId, addressId: $addressId) {
          deletedAddressId
          userErrors { field message }
        }
      }`,
      { customerId: customerGid(customerId), addressId: addressGid(addressId) },
    );
    this.throwUserErrors(data?.customerAddressDelete?.userErrors, 'address');
    return { id: addressId, deleted: true };
  }

  async setDefaultAddress(customerId: string, addressIdParam: string) {
    const addressId = await this.ownedAddressId(customerId, addressIdParam);
    const data = await this.shopifyService.adminGraphQL<any>(
      `mutation SetDefaultAddress($customerId: ID!, $addressId: ID!) {
        customerUpdateDefaultAddress(customerId: $customerId, addressId: $addressId) {
          customer { id }
          userErrors { field message }
        }
      }`,
      { customerId: customerGid(customerId), addressId: addressGid(addressId) },
    );
    this.throwUserErrors(
      data?.customerUpdateDefaultAddress?.userErrors,
      'address',
    );
    return { id: addressId, isDefault: true };
  }

  // The address must belong to the signed-in customer (Shopify would refuse
  // anyway, but this keeps the error a clean 404 instead of a Shopify message).
  private async ownedAddressId(customerId: string, addressIdParam: string) {
    const addressId = numericId(addressIdParam);
    if (!addressId) throw badRequest('Adres bulunamadı.');
    const ids: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < 10; page++) {
      const data = await this.shopifyService.adminGraphQL<any>(
        `query CustomerAddresses($id: ID!, $after: String) {
          customer(id: $id) {
            addressesV2(first: 100, after: $after) {
              nodes { id }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { id: customerGid(customerId), after },
      );
      const connection = data?.customer?.addressesV2;
      (connection?.nodes ?? []).forEach((node: any) => {
        const id = numericId(node?.id);
        if (id) ids.push(id);
      });
      if (!connection?.pageInfo?.hasNextPage) break;
      after = connection.pageInfo.endCursor;
    }
    if (!ids.includes(addressId)) {
      throw new HttpException('Adres bulunamadı.', HttpStatus.NOT_FOUND);
    }
    return addressId;
  }

  private cleanAddress(address: AddressDto | undefined) {
    const firstName = cleanText(address?.firstName, 100);
    const lastName = cleanText(address?.lastName, 100);
    const address1 = cleanText(address?.address1);
    const address2 = cleanText(address?.address2);
    const city = cleanText(address?.city, 100);
    const zip = cleanText(address?.zip, 20);
    const phoneText = cleanText(address?.phone, 40);

    if (!firstName || !lastName) throw badRequest('Ad ve soyad gerekli.');
    if (!address1) throw badRequest('Adres satırını yazmalısın.');
    if (!city) throw badRequest('İl / ilçe alanını yazmalısın.');
    if (zip && !/^\d{5}$/.test(zip)) {
      throw badRequest('Posta kodu 5 haneli olmalı.');
    }
    let phone: string | null = null;
    if (phoneText) {
      phone = normalizePhone(phoneText);
      if (!phone) {
        throw badRequest('Telefon numarası geçersiz. Örnek: 0532 123 45 67');
      }
    }

    return {
      firstName,
      lastName,
      address1,
      address2,
      city,
      zip,
      phone,
      countryCode: 'TR',
    };
  }

  private throwUserErrors(
    errors: UserError[] | undefined,
    context: 'profile' | 'address',
  ) {
    if (!errors?.length) return;
    this.logger.warn(
      `Shopify ${context} userErrors: ${JSON.stringify(errors)}`,
    );
    throw badRequest(toCustomerMessage(errors[0], context));
  }
}

// Shopify's userErrors are English; customers get a Turkish sentence.
export function toCustomerMessage(
  error: UserError,
  context: 'profile' | 'address',
): string {
  const field = (error?.field ?? []).join('.').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  if (field.includes('phone') || message.includes('phone')) {
    if (message.includes('taken')) {
      return 'Bu telefon numarası başka bir hesapta kayıtlı.';
    }
    return 'Telefon numarası geçersiz. Örnek: 0532 123 45 67';
  }
  if (field.includes('zip') || message.includes('zip')) {
    return 'Posta kodu geçersiz.';
  }
  if (field.includes('city')) return 'İl / ilçe alanı geçersiz.';
  if (field.includes('address1')) return 'Adres satırı geçersiz.';
  if (message.includes('default')) {
    return 'Varsayılan adres silinemez. Önce başka bir adresi varsayılan yap.';
  }
  return context === 'profile'
    ? 'Bilgilerin kaydedilemedi, lütfen tekrar dene.'
    : 'Adres kaydedilemedi, lütfen tekrar dene.';
}
