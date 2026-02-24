import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailTemplate, MailType } from './mail.schema';
import { backInStockTemplate } from './templates/mail-templates';

@Injectable()
export class MailSeeder {
  private readonly logger = new Logger(MailSeeder.name);

  constructor(
    @InjectModel(MailTemplate.name)
    private mailTemplateModel: Model<MailTemplate>,
  ) {}

  async seedTemplates(): Promise<void> {
    this.logger.log('Starting mail template seeding...');

    const templates = [
      {
        name: 'back-in-stock-tr',
        mailType: MailType.BACK_IN_STOCK,
        subject: 'Ürün Stoklara Geldi! - {{productName}}',
        htmlContent: backInStockTemplate,
        textContent:
          'Beklediğiniz ürün tekrar stoklarımızda! Hemen sipariş verin.',
        requiredVariables: [
          'productName',
          'email',
          'productUrl',
          'supportEmail',
        ],
        locale: 'tr',
        isActive: true,
      },
    ];

    for (const template of templates) {
      try {
        await this.mailTemplateModel.updateOne(
          { name: template.name },
          { $set: template },
          { upsert: true },
        );
        this.logger.log(`Seeded template: ${template.name}`);
      } catch (error) {
        this.logger.error(`Failed to seed template ${template.name}:`, error);
      }
    }

    this.logger.log('Mail template seeding completed!');
  }

  async removeAllTemplates(): Promise<void> {
    await this.mailTemplateModel.deleteMany({});
    this.logger.log('All mail templates removed');
  }
}
