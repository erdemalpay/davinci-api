import { Injectable, Logger } from '@nestjs/common';
import * as config from 'config';
import { GameService } from '../game/game.service';
import { LocationService } from '../location/location.service';
import { MailType } from '../mail/mail.schema';
import { MailService } from '../mail/mail.service';
import { TournamentRegistration } from './schemas/tournament-registration.schema';
import { Tournament } from './schemas/tournament.schema';
import {
  publishedPosition,
  registrationNote,
  statusLabel,
} from './tournament.waitlist';

// Yedek listesi güncellenince giden mailin türü; boşsa ilk kayıt maili
export enum RegistrationMailKind {
  PROMOTED = 'promoted',
  WAITLIST_UPDATE = 'waitlistUpdate',
}

// Turnuva günü UTC gece yarısı olarak saklanır; "11 Ekim 2026, Pazar" biçimine çevrilir
const formatTournamentDate = (date: Date) => {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', ...options }).format(
      date,
    );
  const day = format({ day: 'numeric', month: 'long', year: 'numeric' });
  return `${day}, ${format({ weekday: 'long' })}`;
};

// Maildeki linklerin yönlendirildiği API adresi (MailService'teki gibi)
const apiHost = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.PRODUCTION_HOST_URL
    : process.env.STAGING_HOST_URL;

// "Katılamayacağım" linkinin açtığı panel sayfası (apiHost ile aynı ortam ayrımı)
const panelHost = () =>
  process.env.NODE_ENV === 'production'
    ? 'https://panel.davinciboardgame.com'
    : 'https://staging-panel.davinciboardgame.com';

@Injectable()
export class TournamentMailService {
  private readonly logger = new Logger(TournamentMailService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly locationService: LocationService,
    private readonly gameService: GameService,
  ) {}

  // Hata fırlatmaz: mail gidemese de kayıt başarılı sayılır, sonuç true/false döner.
  // Durum kişiye bildirilen yerden yazılır (yedek listesi güncellendiyse yeni yeri)
  async sendRegistrationMail(
    tournament: Tournament,
    registration: Pick<
      TournamentRegistration,
      | 'email'
      | 'fullName'
      | 'checkInCode'
      | 'sequence'
      | 'listStatus'
      | 'waitlist'
    >,
    kind?: RegistrationMailKind,
  ): Promise<boolean> {
    try {
      const [location, game] = await Promise.all([
        tournament.location
          ? this.locationService.findLocationById(tournament.location)
          : null,
        tournament.game ? this.gameService.getGameById(tournament.game) : null,
      ]);
      const position = publishedPosition(tournament, registration);
      await this.mailService.sendMail({
        to: registration.email,
        mailType: MailType.TOURNAMENT_REGISTRATION,
        locale: 'tr',
        variables: {
          fullName: registration.fullName,
          tournamentName: tournament.name,
          tournamentDate: formatTournamentDate(tournament.date),
          startTime: tournament.startTime,
          gameName: game?.name,
          locationName: location?.name,
          locationAddress: location?.address,
          mapsUrl: location?.googleMapsUrl,
          logoUrl: config.get<string>('mail.logoUrl'),
          qrCodeUrl: `${apiHost()}/tournaments/public/check-in/${
            registration.checkInCode
          }/qr`,
          registrationStatus: statusLabel(position),
          waitlistNumber: position?.waitlist,
          registrationNote: registrationNote(tournament, position),
          isPromoted: kind === RegistrationMailKind.PROMOTED || undefined,
          isWaitlistUpdate:
            kind === RegistrationMailKind.WAITLIST_UPDATE || undefined,
          cancelUrl: `${panelHost()}/tournament/registration/${
            registration.checkInCode
          }/cancel`,
        },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Turnuva kayıt maili gönderilemedi (${registration.email}):`,
        error,
      );
      return false;
    }
  }
}
