jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { MailType } from '../mail/mail.schema';
import { ListStatus } from './schemas/tournament-registration.schema';
import {
  RegistrationMailKind,
  TournamentMailService,
} from './tournament-mail.service';

const tournament = {
  name: 'AZUL TURNUVASI',
  date: new Date('2026-10-11T00:00:00.000Z'),
  startTime: '13:00',
  game: 230802,
  location: 2,
} as any;
const registration = {
  fullName: 'Ayşe Yılmaz',
  email: 'ayse@mail.com',
  checkInCode: 'abc123',
} as any;

const createService = () => {
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const locationService = {
    findLocationById: jest.fn().mockResolvedValue({
      name: 'Neorama',
      address: 'Beştepe Mah., Ankara',
      googleMapsUrl: 'https://maps.app.goo.gl/x',
    }),
  };
  const gameService = {
    getGameById: jest.fn().mockResolvedValue({ name: 'Azul' }),
  };
  const service = new TournamentMailService(
    mailService as any,
    locationService as any,
    gameService as any,
  );
  return { service, mailService, locationService, gameService };
};

describe('TournamentMailService.sendRegistrationMail', () => {
  it('turnuva, konum ve oyun bilgisiyle kayıt mailini gönderir', async () => {
    process.env.STAGING_HOST_URL = 'https://api-staging.example.com';
    const { service, mailService } = createService();

    await expect(
      service.sendRegistrationMail(tournament, registration),
    ).resolves.toBe(true);

    expect(mailService.sendMail).toHaveBeenCalledWith({
      to: 'ayse@mail.com',
      mailType: MailType.TOURNAMENT_REGISTRATION,
      locale: 'tr',
      variables: {
        fullName: 'Ayşe Yılmaz',
        tournamentName: 'AZUL TURNUVASI',
        tournamentDate: '11 Ekim 2026, Pazar',
        startTime: '13:00',
        gameName: 'Azul',
        locationName: 'Neorama',
        locationAddress: 'Beştepe Mah., Ankara',
        mapsUrl: 'https://maps.app.goo.gl/x',
        logoUrl: 'https://www.davinciboardgame.com/images/davinci-logo.png',
        qrCodeUrl:
          'https://api-staging.example.com/tournaments/public/check-in/abc123/qr',
        cancelUrl:
          'https://staging-panel.davinciboardgame.com/tournament/registration/abc123/cancel',
      },
    });
  });

  it('konum ve oyun tanımlı değilse sorgulamaz, yine gönderir', async () => {
    const { service, mailService, locationService, gameService } =
      createService();

    await service.sendRegistrationMail(
      { ...tournament, location: undefined, game: undefined },
      registration,
    );

    expect(locationService.findLocationById).not.toHaveBeenCalled();
    expect(gameService.getGameById).not.toHaveBeenCalled();
    expect(mailService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          locationName: undefined,
          gameName: undefined,
        }),
      }),
    );
  });

  it('asile asil notunu, yedeğe yedek numarasını ve yedek notunu gönderir', async () => {
    const { service, mailService } = createService();
    const capped = {
      ...tournament,
      capacity: 64,
      participationNote: 'Kayıt formu bilgisi',
      mainNote: 'Kesin kayıt 13:00',
      waitlistNote: 'Sırayla',
    };
    await service.sendRegistrationMail(capped, {
      ...registration,
      sequence: 67,
    });
    const yedek = mailService.sendMail.mock.calls[0][0].variables;
    expect(yedek).toMatchObject({
      registrationStatus: 'Yedek 3',
      waitlistNumber: 3,
      registrationNote: 'Sırayla',
    });
    expect(yedek.participationNote).toBeUndefined();

    await service.sendRegistrationMail(capped, {
      ...registration,
      sequence: 10,
    });
    expect(mailService.sendMail.mock.calls[1][0].variables).toMatchObject({
      registrationStatus: 'Asil',
      waitlistNumber: undefined,
      registrationNote: 'Kesin kayıt 13:00',
    });
  });

  it('yedek listesi güncellenince bildirilen yeni yeri ve mailin türünü gönderir', async () => {
    const { service, mailService } = createService();
    const capped = { ...tournament, capacity: 64 };
    await service.sendRegistrationMail(
      capped,
      { ...registration, sequence: 70, listStatus: ListStatus.MAIN },
      RegistrationMailKind.PROMOTED,
    );
    await service.sendRegistrationMail(
      capped,
      {
        ...registration,
        sequence: 80,
        listStatus: ListStatus.WAITLIST,
        waitlist: 2,
      },
      RegistrationMailKind.WAITLIST_UPDATE,
    );
    const [promoted, updated] = mailService.sendMail.mock.calls.map(
      ([mail]) => mail.variables,
    );
    expect(promoted).toMatchObject({
      registrationStatus: 'Asil',
      isPromoted: true,
    });
    expect(promoted.isWaitlistUpdate).toBeUndefined();
    expect(updated).toMatchObject({
      registrationStatus: 'Yedek 2',
      isWaitlistUpdate: true,
    });
  });

  it('mail gönderilemezse hata fırlatmaz, false döner', async () => {
    const { service, mailService } = createService();
    mailService.sendMail.mockRejectedValue(new Error('SES down'));

    await expect(
      service.sendRegistrationMail(tournament, registration),
    ).resolves.toBe(false);
  });
});
