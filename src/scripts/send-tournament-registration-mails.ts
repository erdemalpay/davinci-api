import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { MailLog, MailType } from 'src/modules/mail/mail.schema';
import { TournamentMailService } from 'src/modules/tournament/tournament-mail.service';
import { TournamentRegistration } from 'src/modules/tournament/schemas/tournament-registration.schema';
import { Tournament } from 'src/modules/tournament/schemas/tournament.schema';

// Bu betik yalnızca elle çalıştırılır; deploy tarafından çağrılmaz.
//   --tournament=<id>   zorunlu
//   (bayraksız)         sadece sayım yapar, mail göndermez
//   --test-to=<adres>   o adrese tek bir örnek mail gönderir
//   --send              daha önce mail gitmemiş başvuranlara gönderir
const getArg = (name: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendTournamentRegistrationMails() {
  const tournamentId = Number(getArg('tournament'));
  if (!tournamentId) {
    console.error('--tournament=<id> zorunlu');
    process.exit(1);
  }
  const testTo = getArg('test-to');
  const shouldSend = process.argv.includes('--send');

  const app = await NestFactory.createApplicationContext(AppModule);
  const tournamentModel: Model<Tournament> = app.get(
    getModelToken(Tournament.name),
  );
  const registrationModel: Model<TournamentRegistration> = app.get(
    getModelToken(TournamentRegistration.name),
  );
  const mailLogModel: Model<MailLog> = app.get(getModelToken(MailLog.name));
  const tournamentMailService = app.get(TournamentMailService);

  const tournament = await tournamentModel.findById(tournamentId);
  if (!tournament) {
    console.error(`Turnuva bulunamadı: ${tournamentId}`);
    process.exit(1);
  }

  if (testTo) {
    const sent = await tournamentMailService.sendRegistrationMail(tournament, {
      fullName: 'Test Kullanıcı',
      email: testTo,
    } as TournamentRegistration);
    console.log(sent ? `Örnek mail gönderildi: ${testTo}` : 'Gönderilemedi');
    await app.close();
    process.exit(sent ? 0 : 1);
  }

  const registrations = await registrationModel
    .find({ tournamentId })
    .sort({ createdAt: 1 });
  // Aynı adresle iki başvuru varsa ilkine gönderilir
  const byEmail = new Map<string, TournamentRegistration>();
  registrations.forEach((registration) => {
    if (!byEmail.has(registration.email)) {
      byEmail.set(registration.email, registration);
    }
  });
  const alreadySent = new Set(
    await mailLogModel.distinct('email', {
      mailType: MailType.TOURNAMENT_REGISTRATION,
      status: 'sent',
      'metadata.tournamentName': tournament.name,
    }),
  );
  const pending = [...byEmail.values()].filter(
    (registration) => !alreadySent.has(registration.email),
  );

  console.log(
    `${tournament.name}: ${registrations.length} başvuru, ${byEmail.size} farklı adres, ` +
      `${alreadySent.size} adrese daha önce gitmiş, ${pending.length} adrese gidecek`,
  );

  if (!shouldSend) {
    console.log('Mail gönderilmedi. Göndermek için --send ekleyin.');
    await app.close();
    process.exit(0);
  }

  let sent = 0;
  let failed = 0;
  for (const registration of pending) {
    const ok = await tournamentMailService.sendRegistrationMail(
      tournament,
      registration,
    );
    if (ok) sent += 1;
    else failed += 1;
    await sleep(200);
  }
  console.log(`Gönderilen: ${sent}, hata: ${failed}`);

  await app.close();
  process.exit(failed ? 1 : 0);
}

sendTournamentRegistrationMails().catch((error) => {
  console.error('Betik başarısız:', error);
  process.exit(1);
});
