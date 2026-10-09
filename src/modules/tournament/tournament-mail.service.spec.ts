jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { MailType } from '../mail/mail.schema';
import { TournamentMailService } from './tournament-mail.service';

const tournament = {
  name: 'AZUL TURNUVASI',
  date: new Date('2026-10-11T00:00:00.000Z'),
  startTime: '13:00',
  game: 230802,
  location: 2,
} as any;
const registration = { fullName: 'Ayşe Yılmaz', email: 'ayse@mail.com' } as any;

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

  it('mail gönderilemezse hata fırlatmaz, false döner', async () => {
    const { service, mailService } = createService();
    mailService.sendMail.mockRejectedValue(new Error('SES down'));

    await expect(
      service.sendRegistrationMail(tournament, registration),
    ).resolves.toBe(false);
  });
});
