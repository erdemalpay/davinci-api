import { Tournament } from './schemas/tournament.schema';

// Kontenjanı olan turnuvada ilk `capacity` kayıt asildir; sonrakilerin yedek numarası döner.
// Asilse, kontenjan yoksa ya da başvuru sıra numarasından önceyse undefined.
export const waitlistNumber = (capacity?: number, sequence?: number) =>
  capacity && sequence && sequence > capacity ? sequence - capacity : undefined;

// Kayıt sonucunda ve mailde gösterilen durum; kontenjansız turnuvada boş
export const registrationStatus = (capacity?: number, sequence?: number) => {
  if (!capacity) return undefined;
  const waitlist = waitlistNumber(capacity, sequence);
  return waitlist ? `Yedek ${waitlist}` : 'Asil';
};

// Panelde temizlenen sayı alanı null gelebilir; yedek kontenjanı boşsa yedek sınırsızdır
export const isOverLimit = (
  limits: Pick<Tournament, 'capacity'> & { waitlistCapacity?: number | null },
  sequence: number,
) =>
  !!limits.capacity &&
  limits.waitlistCapacity != null &&
  sequence > limits.capacity + limits.waitlistCapacity;
