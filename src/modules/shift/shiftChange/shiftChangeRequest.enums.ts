export enum ShiftChangeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ShiftChangeType {
  SWAP = 'SWAP',           // Karşılıklı değişim (iki taraflı)
  TRANSFER = 'TRANSFER',   // Tek taraflı devir (sadece requester shift'ini verir)
}
