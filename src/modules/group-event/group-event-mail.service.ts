import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as config from 'config';
import { Model } from 'mongoose';
import { groupEventUpdateTemplateSeed } from '../mail/mail.seeder';
import { MailTemplate, MailType } from '../mail/mail.schema';
import { MailService } from '../mail/mail.service';
import { GroupEvent, GroupEventStatus } from './group-event.schema';

// "12 Aralık 2026, Cumartesi"
export const formatEventDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', ...options }).format(d);
  return `${format({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}, ${format({ weekday: 'long' })}`;
};

const CONTENT: Record<
  'received' | GroupEventStatus.APPROVED | GroupEventStatus.REJECTED,
  { headline: string; message: string }
> = {
  received: {
    headline: 'Etkinlik başvurunuz alındı',
    message:
      'Grup etkinliği başvurunuz bize ulaştı. Ekibimiz başvurunuzu inceleyip en kısa sürede size dönüş yapacak. Başvurunuz onaylanana kadar seçtiğiniz saat kesinleşmiş sayılmaz.',
  },
  [GroupEventStatus.APPROVED]: {
    headline: 'Etkinlik başvurunuz onaylandı',
    message:
      'Grup etkinliğiniz için yerinizi ayırdık. Sizi kafede ağırlamak için sabırsızlanıyoruz.',
  },
  [GroupEventStatus.REJECTED]: {
    headline: 'Etkinlik başvurunuz hakkında',
    message:
      'Maalesef seçtiğiniz tarih ve saatte etkinliğinizi ağırlayamıyoruz. Farklı bir tarih için yeniden başvurabilir ya da bizi arayabilirsiniz.',
  },
};

@Injectable()
export class GroupEventMailService implements OnModuleInit {
  private readonly logger = new Logger(GroupEventMailService.name);

  constructor(
    private readonly mailService: MailService,
    @InjectModel(MailTemplate.name)
    private readonly mailTemplateModel: Model<MailTemplate>,
  ) {}

  // The template ships with the code, so make sure the database has the current one
  async onModuleInit() {
    try {
      await this.mailTemplateModel.updateOne(
        { _id: groupEventUpdateTemplateSeed._id },
        { $set: groupEventUpdateTemplateSeed },
        { upsert: true },
      );
    } catch (error) {
      this.logger.error('Group event mail template could not be saved', error);
    }
  }

  // Never throws: the application is saved / decided even if the email fails.
  async send(
    event: GroupEvent,
    kind: 'received' | GroupEventStatus.APPROVED | GroupEventStatus.REJECTED,
  ): Promise<boolean> {
    try {
      await this.mailService.sendMail({
        to: event.email,
        mailType: MailType.GROUP_EVENT_UPDATE,
        locale: 'tr',
        variables: {
          ...CONTENT[kind],
          contactName: event.contactName,
          organization: event.organization,
          eventDate: formatEventDate(event.date),
          eventTime: `${event.startTime} - ${event.endTime}`,
          participantCount: String(event.participantCount),
          responseNote: kind === 'received' ? undefined : event.responseNote,
          logoUrl: config.get<string>('mail.logoUrl'),
        },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Group event email (${kind}) could not be sent to ${event.email}`,
        error,
      );
      return false;
    }
  }
}
