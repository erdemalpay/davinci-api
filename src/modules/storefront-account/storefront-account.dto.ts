// Bodies sent by the kutuoyunual.com "Profilim" page through the app proxy.
// Everything is re-checked in StorefrontAccountService; nothing here is trusted.

export class UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  // Empty string clears the phone number.
  phone?: string;
}

export class AddressDto {
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  phone?: string;
}

export class SaveAddressDto {
  address: AddressDto;
  setAsDefault?: boolean;
}
