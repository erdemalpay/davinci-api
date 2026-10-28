import {
  ConfirmationStatus,
  ListStatus,
  TournamentRegistration,
} from './schemas/tournament-registration.schema';
import { Tournament } from './schemas/tournament.schema';

export interface ListPosition {
  listStatus: ListStatus;
  waitlist?: number;
}

type ListRules = Pick<Tournament, 'capacity' | 'waitlistAnchor'>;
type ListEntry = Pick<
  TournamentRegistration,
  | '_id'
  | 'sequence'
  | 'listStatus'
  | 'waitlist'
  | 'confirmationStatus'
  | 'isManualMain'
  | 'requeuedAt'
>;

// Kayıt sırasından listedeki yer: ilk `capacity` kayıt asil, sonrakiler sırayla yedek.
// Liste güncellendiyse ondan sonra gelenler kalan asil yerlerine, sonra listenin sonuna eklenir.
export const positionFromSequence = (
  tournament: ListRules,
  sequence?: number,
): ListPosition | undefined => {
  if (!tournament.capacity || !sequence) return undefined;
  const {
    sequence: base,
    freeMain,
    waitlistCount,
  } = tournament.waitlistAnchor ?? {
    sequence: 0,
    freeMain: tournament.capacity,
    waitlistCount: 0,
  };
  const order = sequence - base;
  return order <= freeMain
    ? { listStatus: ListStatus.MAIN }
    : {
        listStatus: ListStatus.WAITLIST,
        waitlist: waitlistCount + order - freeMain,
      };
};

// Kişiye en son bildirilen yer; kontenjansız turnuvada ve sırasız eski başvuruda yok
export const publishedPosition = (
  tournament: ListRules,
  registration: Pick<ListEntry, 'sequence' | 'listStatus' | 'waitlist'>,
): ListPosition | undefined => {
  if (!tournament.capacity) return undefined;
  if (!registration.listStatus)
    return positionFromSequence(tournament, registration.sequence);
  return registration.listStatus === ListStatus.WAITLIST
    ? { listStatus: ListStatus.WAITLIST, waitlist: registration.waitlist }
    : { listStatus: registration.listStatus };
};

// Kayıt sonucunda ve mailde gösterilen durum
export const statusLabel = (position?: ListPosition) => {
  if (position?.listStatus === ListStatus.MAIN) return 'Asil';
  if (position?.listStatus === ListStatus.WAITLIST)
    return `Yedek ${position.waitlist}`;
  return undefined;
};

// Kayıttan sonra kişiye gösterilen not: asile asil bilgisi, yedeğe yedek bilgisi
export const registrationNote = (
  tournament: Pick<Tournament, 'mainNote' | 'waitlistNote'>,
  position?: ListPosition,
) => {
  if (position?.listStatus === ListStatus.MAIN) return tournament.mainNote;
  if (position?.listStatus === ListStatus.WAITLIST)
    return tournament.waitlistNote;
  return undefined;
};

export const isSamePosition = (a?: ListPosition, b?: ListPosition) =>
  a?.listStatus === b?.listStatus && a?.waitlist === b?.waitlist;

// Yeni başvurunun yedek numarası yedek kontenjanını aşıyorsa kayıt alınmaz
export const isOverLimit = (
  tournament: ListRules & { waitlistCapacity?: number | null },
  sequence: number,
) =>
  tournament.waitlistCapacity != null &&
  (positionFromSequence(tournament, sequence)?.waitlist ?? 0) >
    tournament.waitlistCapacity;

// "Yedek Listesini Güncelle"ye basılırsa herkesin alacağı yer. Bildirilen yer hiç kötüleşmez:
// asil asil kalır, yedekler aynı sırayla ilerler, iptali geri alınan listenin sonuna eklenir.
export const nextPositions = (
  tournament: ListRules,
  registrations: ListEntry[],
): Map<number, ListPosition> => {
  const positions = new Map<number, ListPosition>();
  if (!tournament.capacity) return positions;
  const listed = registrations.flatMap((registration) => {
    const published = publishedPosition(tournament, registration);
    return published ? [{ registration, published }] : [];
  });
  const active = listed.filter(({ registration }) => {
    const isDeclined =
      registration.confirmationStatus === ConfirmationStatus.DECLINED;
    if (isDeclined)
      positions.set(registration._id, { listStatus: ListStatus.WITHDRAWN });
    return !isDeclined;
  });
  type Entry = (typeof active)[number];
  const isMain = ({ registration, published }: Entry) =>
    registration.isManualMain || published.listStatus === ListStatus.MAIN;
  const mains = active.filter(isMain);
  mains.forEach(({ registration }) =>
    positions.set(registration._id, { listStatus: ListStatus.MAIN }),
  );

  const requeuedAt = ({ registration }: Entry) =>
    registration.requeuedAt?.getTime() ?? 0;
  const candidates = active
    .filter((entry) => !isMain(entry))
    .sort(
      (a, b) =>
        Number(requeuedAt(a) > 0) - Number(requeuedAt(b) > 0) ||
        requeuedAt(a) - requeuedAt(b) ||
        (a.published.waitlist ?? 0) - (b.published.waitlist ?? 0) ||
        (a.registration.sequence ?? 0) - (b.registration.sequence ?? 0),
    );
  const freeMain = Math.max(0, tournament.capacity - mains.length);
  candidates.forEach(({ registration }, i) =>
    positions.set(
      registration._id,
      i < freeMain
        ? { listStatus: ListStatus.MAIN }
        : { listStatus: ListStatus.WAITLIST, waitlist: i - freeMain + 1 },
    ),
  );
  return positions;
};
