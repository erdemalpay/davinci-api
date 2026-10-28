import * as Handlebars from 'handlebars';
import { tournamentRegistrationTemplate } from './mail-templates';

const render = (variables: Record<string, unknown>) =>
  Handlebars.compile(tournamentRegistrationTemplate)({
    fullName: 'Ali',
    tournamentName: 'Catan',
    tournamentDate: '1 Kasım 2026',
    registrationNoteHtml: variables.registrationNote,
    ...variables,
  });

describe('tournamentRegistrationTemplate (yedek sırası)', () => {
  it('yedeğe notun altında güncel yedek numarasını gösterir', () => {
    const html = render({
      registrationStatus: 'Yedek 3',
      waitlistNumber: 3,
      registrationNote: 'Yedek bilgisi',
    });
    expect(html).toContain('Yedek bilgisi');
    expect(html).toMatch(/Yedek listesindeki sıranız:[^>]*>\s*3\. yedek/);
    expect(html.indexOf('Yedek bilgisi')).toBeLessThan(
      html.indexOf('Yedek listesindeki sıranız'),
    );
  });

  it('sırası güncellenen yedeğe yeni numarayı gösterir', () => {
    const html = render({
      isWaitlistUpdate: true,
      registrationStatus: 'Yedek 1',
      waitlistNumber: 1,
      registrationNote: 'Yedek bilgisi',
    });
    expect(html).toMatch(/Yedek listesindeki sıranız:[^>]*>\s*1\. yedek/);
  });

  it('asile sıra satırı eklemez', () => {
    const html = render({
      registrationStatus: 'Asil',
      registrationNote: 'Asil bilgisi',
    });
    expect(html).toContain('Asil bilgisi');
    expect(html).not.toContain('Yedek listesindeki sıranız');
  });

  it('not yoksa otomatik cümle çıkar, sıra satırı tekrarlanmaz', () => {
    const html = render({ registrationStatus: 'Yedek 2', waitlistNumber: 2 });
    expect(html).toContain('2. yedek');
    expect(html).not.toContain('Yedek listesindeki sıranız');
  });
});

describe('tournamentRegistrationTemplate (iptal bağlantısı)', () => {
  it('notun içindeki iptal bağlantısı tıklanabilir bağlantı olarak çıkar', () => {
    const html = render({
      registrationStatus: 'Asil',
      registrationNote: 'Değişirse',
      registrationNoteHtml:
        'Değişirse <a href="https://x/iptal">buradan kaydınızı iptal edebilirsiniz</a>.',
    });
    expect(html).toContain(
      'Değişirse <a href="https://x/iptal">buradan kaydınızı iptal edebilirsiniz</a>.',
    );
  });
});
